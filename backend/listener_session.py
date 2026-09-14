"""Active patient for ESP32 uploads when Live Scan listener is armed (prototype)."""

from datetime import datetime, timedelta
from typing import Any, Dict, Optional

SESSION_TTL = timedelta(hours=4)

_session: Optional[Dict[str, Any]] = None


def arm_listener(medical_personnel_id: int, patient_id: int, patient_name: str) -> None:
    global _session
    _session = {
        "medical_personnel_id": medical_personnel_id,
        "patient_id": patient_id,
        "patient_name": patient_name,
        "expires_at": datetime.utcnow() + SESSION_TTL,
    }


def disarm_listener(medical_personnel_id: Optional[int] = None) -> None:
    global _session
    if _session is None:
        return
    if medical_personnel_id is not None and _session.get("medical_personnel_id") != medical_personnel_id:
        return
    _session = None


def get_armed_session() -> Optional[Dict[str, Any]]:
    global _session
    if _session is None:
        return None
    if datetime.utcnow() > _session["expires_at"]:
        _session = None
        return None
    return _session
