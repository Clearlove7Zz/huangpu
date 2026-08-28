#!/usr/bin/env python3
"""Download YOLOv8m PPE weights from Hugging Face into models/best.pt."""

from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ID = "Hexmon/vyra-yolo-ppe-detection"
FILENAME = "best.pt"

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"


def main() -> int:
    MODELS.mkdir(parents=True, exist_ok=True)
    dest = MODELS / FILENAME
    if dest.exists() and dest.stat().st_size > 1_000_000:
        print(f"Model already present: {dest} ({dest.stat().st_size / 1e6:.1f} MB)")
        return 0

    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("Install deps first: pip install -r requirements.txt", file=sys.stderr)
        return 1

    # Prefer China mirror when HF is unreachable (override with HF_ENDPOINT)
    os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")
    print(f"Downloading {REPO_ID}/{FILENAME} via {os.environ['HF_ENDPOINT']} ...")
    path = hf_hub_download(
        repo_id=REPO_ID,
        filename=FILENAME,
        local_dir=str(MODELS),
    )
    downloaded = Path(path)
    if downloaded.resolve() != dest.resolve():
        dest.write_bytes(downloaded.read_bytes())
    print(f"Saved to {dest} ({dest.stat().st_size / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
