#!/usr/bin/env python3
"""Safety inspection AI service — YOLOv8 PPE hazard detection."""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

import hazard_map

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
UPLOADS = DATA / "uploads"
ANNOTATED = DATA / "annotated"
DB_PATH = DATA / "safety.db"
MODELS = ROOT / "models"
WEIGHTS = MODELS / "best.pt"

for d in (DATA, UPLOADS, ANNOTATED, MODELS):
    d.mkdir(parents=True, exist_ok=True)


class PrivateNetworkAccessMiddleware(BaseHTTPMiddleware):
    """Allow Chrome Private Network Access from public pages (e.g. huangpu-szsp.xyz → 127.0.0.1)."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response


app = FastAPI(title="黄埔城更安全日志 AI巡检", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Must be added after CORS so it is outermost and tags preflight responses too
app.add_middleware(PrivateNetworkAccessMiddleware)

_model = None
_model_error: Optional[str] = None


def get_model():
    global _model, _model_error
    if _model is not None:
        return _model
    if not WEIGHTS.exists():
        _model_error = f"Weights missing: {WEIGHTS}. Run: python download_model.py"
        raise RuntimeError(_model_error)
    try:
        from ultralytics import YOLO

        _model = YOLO(str(WEIGHTS))
        _model_error = None
        return _model
    except Exception as e:
        _model_error = str(e)
        raise


@contextmanager
def db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS inspections (
                id TEXT PRIMARY KEY,
                project TEXT,
                area TEXT,
                inspector TEXT,
                check_date TEXT,
                created_at TEXT,
                person_count INTEGER,
                hazard_count INTEGER,
                highest_level TEXT,
                hazard_situation TEXT,
                suggestion TEXT,
                rectify_person TEXT,
                rectify_time TEXT,
                recheck_plan TEXT,
                recheck_status TEXT,
                hazards_json TEXT,
                original_path TEXT,
                annotated_path TEXT,
                written_to_log INTEGER DEFAULT 0
            )
            """
        )


init_db()


class PatchRecord(BaseModel):
    rectify_person: Optional[str] = None
    rectify_time: Optional[str] = None
    recheck_plan: Optional[str] = None
    recheck_status: Optional[str] = None
    written_to_log: Optional[bool] = None
    hazard_situation: Optional[str] = None
    suggestion: Optional[str] = None


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    d["hazards"] = json.loads(d.pop("hazards_json") or "[]")
    d["written_to_log"] = bool(d.get("written_to_log"))
    rid = d["id"]
    d["annotated_url"] = f"/api/images/annotated/{rid}"
    d["original_url"] = f"/api/images/original/{rid}"
    d.pop("original_path", None)
    d.pop("annotated_path", None)
    return d


@app.on_event("startup")
def startup_load_model():
    try:
        get_model()
        print("YOLO PPE model loaded.")
    except Exception as e:
        print(f"WARN: model not loaded yet — {e}")


@app.get("/api/health")
def health():
    loaded = _model is not None
    if not loaded:
        try:
            get_model()
            loaded = True
        except Exception:
            loaded = False
    return {
        "ok": True,
        "model_loaded": loaded,
        "model_path": str(WEIGHTS) if WEIGHTS.exists() else None,
        "error": _model_error,
        "classes": list(hazard_map.HAZARD_CLASSES.keys()),
    }


@app.post("/api/inspect")
async def inspect(
    file: UploadFile = File(...),
    project: str = Form("新联复建01地块"),
    area: str = Form("施工现场"),
    inspector: str = Form("安全员"),
    check_date: str = Form(""),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        # allow octet-stream for some browsers
        if file.content_type not in (None, "application/octet-stream"):
            raise HTTPException(400, f"Expect image upload, got {file.content_type}")

    try:
        model = get_model()
    except Exception as e:
        raise HTTPException(503, f"Model unavailable: {e}") from e

    record_id = uuid.uuid4().hex[:12]
    suffix = Path(file.filename or "upload.jpg").suffix.lower() or ".jpg"
    if suffix not in (".jpg", ".jpeg", ".png", ".webp", ".bmp"):
        suffix = ".jpg"
    original_path = UPLOADS / f"{record_id}{suffix}"
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")
    original_path.write_bytes(content)

    results = model.predict(str(original_path), conf=0.25, verbose=False)
    result = results[0]

    hazards: list[dict[str, Any]] = []
    person_count = 0
    detections: list[dict[str, Any]] = []

    names = result.names or {}
    if result.boxes is not None and len(result.boxes):
        for box in result.boxes:
            cls_id = int(box.cls[0])
            conf = float(box.conf[0])
            xyxy = box.xyxy[0].tolist()
            class_name = names.get(cls_id, str(cls_id))
            detections.append({"class": class_name, "confidence": conf, "bbox": xyxy})
            if class_name == "Person":
                person_count += 1
            mapped = hazard_map.map_detection(class_name, conf, xyxy)
            if mapped:
                hazards.append(mapped)

    annotated_path = ANNOTATED / f"{record_id}.jpg"
    plotted = result.plot()  # BGR ndarray
    try:
        import cv2

        cv2.imwrite(str(annotated_path), plotted)
    except Exception:
        from PIL import Image
        import numpy as np

        rgb = plotted[:, :, ::-1]
        Image.fromarray(np.ascontiguousarray(rgb)).save(annotated_path, quality=90)

    check_date = check_date or date.today().isoformat()
    situation = hazard_map.build_hazard_situation(hazards, area)
    suggestion = hazard_map.default_suggestion(hazards)
    level = hazard_map.highest_level(hazards)
    created_at = datetime.now().isoformat(timespec="seconds")

    with db() as conn:
        conn.execute(
            """
            INSERT INTO inspections (
                id, project, area, inspector, check_date, created_at,
                person_count, hazard_count, highest_level, hazard_situation, suggestion,
                rectify_person, rectify_time, recheck_plan, recheck_status,
                hazards_json, original_path, annotated_path, written_to_log
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)
            """,
            (
                record_id,
                project,
                area,
                inspector,
                check_date,
                created_at,
                person_count,
                len(hazards),
                level,
                situation,
                suggestion,
                "",
                "",
                check_date if hazards else "",
                "待整改" if hazards else "无隐患",
                json.dumps(hazards, ensure_ascii=False),
                str(original_path),
                str(annotated_path),
            ),
        )

    return {
        "record_id": record_id,
        "project": project,
        "area": area,
        "inspector": inspector,
        "check_date": check_date,
        "created_at": created_at,
        "hazards": hazards,
        "detections": detections,
        "summary": {
            "person_count": person_count,
            "hazard_count": len(hazards),
            "highest_level": level,
            "hazard_situation": situation,
            "suggestion": suggestion,
        },
        "annotated_url": f"/api/images/annotated/{record_id}",
        "original_url": f"/api/images/original/{record_id}",
    }


@app.get("/api/records")
def list_records(limit: int = 50):
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM inspections ORDER BY created_at DESC LIMIT ?",
            (min(limit, 200),),
        ).fetchall()
    return {"items": [row_to_dict(r) for r in rows]}


@app.get("/api/records/{record_id}")
def get_record(record_id: str):
    with db() as conn:
        row = conn.execute(
            "SELECT * FROM inspections WHERE id = ?", (record_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Record not found")
    return row_to_dict(row)


@app.patch("/api/records/{record_id}")
def patch_record(record_id: str, body: PatchRecord):
    fields = body.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(400, "No fields to update")
    if "written_to_log" in fields:
        fields["written_to_log"] = 1 if fields["written_to_log"] else 0
    cols = ", ".join(f"{k} = ?" for k in fields)
    vals = list(fields.values()) + [record_id]
    with db() as conn:
        cur = conn.execute(f"UPDATE inspections SET {cols} WHERE id = ?", vals)
        if cur.rowcount == 0:
            raise HTTPException(404, "Record not found")
        row = conn.execute(
            "SELECT * FROM inspections WHERE id = ?", (record_id,)
        ).fetchone()
    return row_to_dict(row)


@app.get("/api/images/annotated/{record_id}")
def annotated_image(record_id: str):
    path = ANNOTATED / f"{record_id}.jpg"
    if not path.exists():
        with db() as conn:
            row = conn.execute(
                "SELECT annotated_path FROM inspections WHERE id = ?", (record_id,)
            ).fetchone()
        if row and Path(row["annotated_path"]).exists():
            path = Path(row["annotated_path"])
        else:
            raise HTTPException(404, "Image not found")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/api/images/original/{record_id}")
def original_image(record_id: str):
    with db() as conn:
        row = conn.execute(
            "SELECT original_path FROM inspections WHERE id = ?", (record_id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Record not found")
    path = Path(row["original_path"])
    if not path.exists():
        raise HTTPException(404, "Image not found")
    media = "image/jpeg"
    if path.suffix.lower() == ".png":
        media = "image/png"
    elif path.suffix.lower() == ".webp":
        media = "image/webp"
    return FileResponse(path, media_type=media)


# Optional: serve annotated/uploads as static for debugging
app.mount("/static/annotated", StaticFiles(directory=str(ANNOTATED)), name="ann_static")
app.mount("/static/uploads", StaticFiles(directory=str(UPLOADS)), name="up_static")
