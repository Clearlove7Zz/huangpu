"""Map YOLO PPE class names to 安全日志 隐患 fields (Chinese)."""

from __future__ import annotations

from typing import Any

# Classes that indicate a safety violation / hazard
HAZARD_CLASSES: dict[str, dict[str, str]] = {
    "NO-Hardhat": {
        "label_zh": "未佩戴安全帽",
        "level": "一般隐患",
        "suggestion": "加强安全教育，对作业人员进行安全交底，进入施工现场必须佩戴安全帽；",
    },
    "NO-Safety Vest": {
        "label_zh": "未穿反光背心",
        "level": "一般隐患",
        "suggestion": "要求作业人员进入施工现场必须穿反光背心，班组复查后方可作业；",
    },
    "NO-Mask": {
        "label_zh": "未佩戴口罩/面罩",
        "level": "一般隐患",
        "suggestion": "按作业环境要求佩戴口罩或防护面罩，补齐防护用品后复查；",
    },
    "NO-Gloves": {
        "label_zh": "未佩戴防护手套",
        "level": "一般隐患",
        "suggestion": "涉及钢筋、焊接等作业必须佩戴防护手套，班组现场督促整改；",
    },
    "NO-Goggles": {
        "label_zh": "未佩戴防护眼镜",
        "level": "一般隐患",
        "suggestion": "切割、焊接、扬尘作业须佩戴防护眼镜，整改后复查；",
    },
    "Fall-Detected": {
        "label_zh": "疑似高处坠落风险",
        "level": "重大关注",
        "suggestion": "立即停止相关高处作业，检查临边防护与安全带，确认安全后方可复工；",
    },
}

# Compliant / context classes (logged for summary, not as 隐患)
COMPLIANT_CLASSES = {
    "Hardhat",
    "Safety Vest",
    "Gloves",
    "Goggles",
    "Mask",
    "Person",
    "Ladder",
    "Safety Cone",
}

LEVEL_PRIORITY = {"重大关注": 3, "一般隐患": 2, "合规": 1}


def map_detection(class_name: str, confidence: float, bbox: list[float]) -> dict[str, Any] | None:
    """Return a hazard dict if class is a violation; otherwise None."""
    info = HAZARD_CLASSES.get(class_name)
    if not info:
        return None
    return {
        "class": class_name,
        "label_zh": info["label_zh"],
        "level": info["level"],
        "confidence": round(float(confidence), 4),
        "bbox": [round(float(x), 1) for x in bbox],
        "suggestion": info["suggestion"],
    }


def build_hazard_situation(hazards: list[dict[str, Any]], area: str) -> str:
    if not hazards:
        return "无"
    parts = []
    for h in hazards:
        parts.append(f"{h['label_zh']}（置信度{h['confidence']:.0%}）")
    return f"现场{'；'.join(parts)}" + (f"，所属部位：{area}" if area else "")


def highest_level(hazards: list[dict[str, Any]]) -> str:
    if not hazards:
        return "合规"
    return max(hazards, key=lambda h: LEVEL_PRIORITY.get(h["level"], 0))["level"]


def default_suggestion(hazards: list[dict[str, Any]]) -> str:
    if not hazards:
        return ""
    # Prefer the first unique suggestion
    seen = []
    for h in hazards:
        s = h.get("suggestion") or ""
        if s and s not in seen:
            seen.append(s)
    return "；".join(seen)
