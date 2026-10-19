"""Durable single-scan lifecycle; transitions share the reading transaction."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4
from sqlalchemy.orm import Session
from fastapi import HTTPException

import models
from sensor_auth import SensorActor, actor_device_id, configured_device_id

SESSION_TTL = timedelta(minutes=15)
ACTIVE_STATUSES = ("pending", "collecting")
DEVICE_HEARTBEAT_SECONDS = 60


def utc_now() -> datetime:
    # SQLite stores naive UTC; API serializers make UTC explicit.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def expire_sessions(db: Session, medical_id: int) -> None:
    # The first DML obtains SQLite's transaction write lock. It may have waited
    # past a deadline; evaluate again under that lock before any transition.
    for _ in range(2):
        db.query(models.ScanSession).filter(
            models.ScanSession.medical_personnel_id == medical_id,
            models.ScanSession.status.in_(ACTIVE_STATUSES),
            models.ScanSession.expires_at <= utc_now(),
        ).update({"status": "expired", "active_provider_id": None,
                  "finished_at": models.ScanSession.expires_at}, synchronize_session="fetch")


def create_scan(db: Session, medical_id: int, patient_id: int, *, source: str = "device",
                sensor_configuration: str = "tgs822_tgs2620", timeout_seconds: int = 900,
                replace_active: bool = True, session_id: str | None = None) -> models.ScanSession:
    expire_sessions(db, medical_id)
    now = utc_now()
    if replace_active:
        db.query(models.ScanSession).filter(
            models.ScanSession.active_provider_id == medical_id,
            models.ScanSession.status.in_(ACTIVE_STATUSES),
        ).update({"status": "replaced", "active_provider_id": None, "finished_at": now},
                 synchronize_session="fetch")
    scan = models.ScanSession(
        id=session_id or uuid4().hex, medical_personnel_id=medical_id, patient_id=patient_id,
        device_id=configured_device_id() if source == "device" else f"manual-provider-{medical_id}",
        source=source, sensor_configuration=sensor_configuration, status="pending",
        active_provider_id=medical_id if replace_active else None,
        created_at=now, expires_at=now + timedelta(seconds=timeout_seconds),
    )
    db.add(scan)
    db.flush()
    return scan


def owned_scan(db: Session, session_id: str, actor: SensorActor) -> models.ScanSession:
    scan = db.get(models.ScanSession, session_id)
    if scan is None or scan.medical_personnel_id != actor.medical_id:
        raise HTTPException(status_code=404, detail="Scan session not found.")
    if actor.is_device and (scan.source != "device" or scan.device_id != actor_device_id(actor)):
        raise HTTPException(status_code=404, detail="Scan session not found.")
    return scan


def get_armed_session(db: Session, medical_id: int) -> models.ScanSession | None:
    expire_sessions(db, medical_id)
    return db.query(models.ScanSession).filter(
        models.ScanSession.active_provider_id == medical_id,
        models.ScanSession.source == "device",
        models.ScanSession.status.in_(ACTIVE_STATUSES),
        models.ScanSession.expires_at > utc_now(),
    ).first()


def cancel_scan(db: Session, scan: models.ScanSession) -> None:
    db.query(models.ScanSession).filter(
        models.ScanSession.id == scan.id, models.ScanSession.status.in_(ACTIVE_STATUSES),
        models.ScanSession.expires_at > utc_now(),
    ).update({"status": "cancelled", "active_provider_id": None, "finished_at": utc_now()},
             synchronize_session="fetch")


def session_response(db: Session, scan: models.ScanSession) -> dict:
    # Refresh after atomic transitions so a losing cancellation/heartbeat does
    # not return an older ORM snapshot while another worker completed the scan.
    db.refresh(scan)
    receipt = db.query(models.SensorAcquisition).filter_by(scan_session_id=scan.id).first()
    connection = "not_applicable" if scan.source == "manual" else "unknown"
    if scan.source == "device" and scan.last_device_seen_at is not None:
        connection = "connected" if (utc_now() - scan.last_device_seen_at).total_seconds() < DEVICE_HEARTBEAT_SECONDS else "disconnected"
    return {"session_id": scan.id, "patient_id": scan.patient_id,
            "medical_personnel_id": scan.medical_personnel_id, "device_id": scan.device_id,
            "source": scan.source, "sensor_configuration": scan.sensor_configuration,
            "status": scan.status, "created_at": scan.created_at, "expires_at": scan.expires_at,
            "finished_at": scan.finished_at, "last_device_seen_at": scan.last_device_seen_at,
            "device_connection": connection, "reading_id": receipt.reading_id if receipt else None,
            "acquisition_id": receipt.acquisition_id if receipt else None}
