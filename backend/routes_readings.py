from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.orm import Session
from typing import Dict, List, Optional, Tuple
import logging
import asyncio
from sqlalchemy.exc import SQLAlchemyError
from fastapi.routing import APIRoute
from uuid import uuid4
import hashlib
import json
from starlette.websockets import WebSocketState
from database import get_db
from auth import get_current_medical, get_current_patient, get_medical_from_token
from classifier import raw_to_ppm, classify_diabetes_level, get_level_color, get_health_suggestion, validate_breath_signal
import models, schemas
from estimation_service import estimate_glucose
from sensor_processing import tgs_processing_metadata
from tgs_preprocessing import preprocess, load_profile
from tgs_estimation import estimate_tgs, unavailable
from sensor_auth import SensorActor, get_sensor_actor, actor_device_id
from listener_session import (create_scan, owned_scan, get_armed_session, cancel_scan,
                              expire_sessions, session_response, utc_now, ACTIVE_STATUSES)


logger = logging.getLogger(__name__)


class ReadingDatabaseErrorRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def guarded(request):
            try:
                return await handler(request)
            except SQLAlchemyError as exc:
                logger.error("Reading/scan database operation failed.")
                raise HTTPException(status_code=503, detail="Storage temporarily unavailable. Check scan/acquisition status before retrying with the same acquisition ID.") from exc
        return guarded


router = APIRouter(route_class=ReadingDatabaseErrorRoute)

# Simulator uses provider JWTs and the same ingestion transaction, never device keys.
from simulation import register_routes
register_routes(router)


def commit_scan(db: Session) -> None:
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Scan update could not be saved. Check its status before retrying.") from exc


class MedicalSocketManager:
    def __init__(self):
        self.connections: Dict[int, List[Tuple[WebSocket, Optional[int]]]] = {}
        self.authorizers = {}

    async def connect(self, medical_id: int, websocket: WebSocket, patient_id: Optional[int], authorizer=None):
        if websocket.application_state != WebSocketState.CONNECTED:
            await websocket.accept()
        self.connections.setdefault(medical_id, []).append((websocket, patient_id))
        if authorizer is not None:
            self.authorizers[websocket] = authorizer

    def disconnect(self, medical_id: int, websocket: WebSocket):
        self.authorizers.pop(websocket, None)
        current = self.connections.get(medical_id, [])
        self.connections[medical_id] = [(ws, pid) for ws, pid in current if ws != websocket]
        if not self.connections[medical_id]:
            del self.connections[medical_id]

    async def broadcast_reading(self, medical_id: int, payload: dict):
        targets = list(self.connections.get(medical_id, []))
        stale: List[WebSocket] = []
        for websocket, subscribed_patient_id in targets:
            if subscribed_patient_id is not None and subscribed_patient_id != payload["patient_id"]:
                continue
            try:
                # Validate before every sensitive outbound event, not just ping/timeout.
                authorizer = self.authorizers.get(websocket)
                if authorizer is not None and not authorizer():
                    await websocket.close(code=1008, reason="Session expired. Please log in again.")
                    stale.append(websocket)
                    continue
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(medical_id, websocket)


socket_manager = MedicalSocketManager()

def owned_patient(patient_id: int, medical_id: int, db: Session) -> models.Patient:
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id,
        models.Patient.medical_personnel_id == medical_id,
    ).first()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return patient


@router.get("/listener/ping")
def listener_ping(current=Depends(get_current_medical)):
    return {"status": "ok"}


@router.post("/listener/start", response_model=schemas.ArmedPatientResponse)
def start_listener(data: schemas.ListenerArmRequest, db: Session = Depends(get_db),
                   current=Depends(get_current_medical)):
    patient = owned_patient(data.patient_id, current.id, db)
    scan = create_scan(db, current.id, patient.id)
    session_id, expires_at = scan.id, scan.expires_at
    patient_name = patient.full_name
    commit_scan(db)
    return {"armed": True, "patient_id": data.patient_id, "patient_name": patient_name,
            "message": "Scan armed for up to 15 minutes. One saved acquisition completes the session.",
            "session_id": session_id, "status": "pending", "expires_at": expires_at}


@router.post("/listener/stop")
def stop_listener(current=Depends(get_current_medical), data: Optional[schemas.ListenerStopRequest] = None,
                  db: Session = Depends(get_db)):
    expire_sessions(db, current.id)
    if data:
        scan = db.query(models.ScanSession).filter_by(id=data.session_id, medical_personnel_id=current.id).first()
    else:
        scan = get_armed_session(db, current.id)
    if scan:
        cancel_scan(db, scan)
    commit_scan(db)
    return {"armed": False, "message": "Listener stopped."}


@router.get("/listener/armed-patient", response_model=schemas.ArmedPatientResponse)
def armed_patient(db: Session = Depends(get_db), actor: SensorActor = Depends(get_sensor_actor)):
    session = get_armed_session(db, actor.medical_id)
    if session is None:
        commit_scan(db)
        return {"armed": False}
    if actor.is_device and session.device_id != actor_device_id(actor):
        commit_scan(db)
        return {"armed": False}
    try:
        patient = owned_patient(session.patient_id, actor.medical_id, db)
    except HTTPException:
        cancel_scan(db, session)
        commit_scan(db)
        return {"armed": False}
    if actor.is_device:
        session.last_device_seen_at = utc_now()
    response = {"armed": True, "patient_id": patient.id, "patient_name": patient.full_name,
                "session_id": session.id, "device_id": session.device_id,
                "status": session.status, "expires_at": session.expires_at}
    commit_scan(db)
    return response


@router.post("/scans", response_model=schemas.ScanSessionResponse)
def start_scan(data: schemas.ScanStartRequest, db: Session = Depends(get_db),
               current=Depends(get_current_medical)):
    patient = owned_patient(data.patient_id, current.id, db)
    scan = create_scan(db, current.id, patient.id, source=data.source,
                       sensor_configuration=data.sensor_configuration, timeout_seconds=data.timeout_seconds)
    response = session_response(db, scan)
    commit_scan(db)
    return response


@router.get("/scans/{session_id}", response_model=schemas.ScanSessionResponse)
def monitor_scan(session_id: str, db: Session = Depends(get_db), actor: SensorActor = Depends(get_sensor_actor)):
    scan = owned_scan(db, session_id, actor)
    owned_patient(scan.patient_id, actor.medical_id, db)
    expire_sessions(db, actor.medical_id)
    response = session_response(db, scan)
    commit_scan(db)
    return response


@router.post("/scans/{session_id}/cancel", response_model=schemas.ScanSessionResponse)
def cancel_scan_session(session_id: str, db: Session = Depends(get_db), current=Depends(get_current_medical)):
    scan = owned_scan(db, session_id, SensorActor(current.id))
    owned_patient(scan.patient_id, current.id, db)
    expire_sessions(db, current.id)
    cancel_scan(db, scan)
    response = session_response(db, scan)
    commit_scan(db)
    return response


@router.post("/scans/{session_id}/heartbeat", response_model=schemas.ScanSessionResponse)
def scan_heartbeat(session_id: str, db: Session = Depends(get_db), actor: SensorActor = Depends(get_sensor_actor)):
    if not actor.is_device:
        raise HTTPException(status_code=403, detail="Device authentication required.")
    scan = owned_scan(db, session_id, actor)
    owned_patient(scan.patient_id, actor.medical_id, db)
    expire_sessions(db, actor.medical_id)
    changed = db.query(models.ScanSession).filter(
        models.ScanSession.id == scan.id, models.ScanSession.status.in_(ACTIVE_STATUSES),
        models.ScanSession.expires_at > utc_now(),
    ).update({"status": "collecting", "last_device_seen_at": utc_now()}, synchronize_session="fetch")
    if not changed:
        commit_scan(db)
        raise HTTPException(status_code=409, detail="Scan session is no longer active.")
    response = session_response(db, scan)
    commit_scan(db)
    return response


def reading_result(reading: schemas.ReadingResponse, patient_name: str, duplicate: bool = False) -> dict:
    level = reading.diabetes_level.value if reading.diabetes_level is not None else None
    return {"reading": reading, "patient_name": patient_name, "duplicate": duplicate,
            "acetone_ppm": reading.acetone_ppm, "diabetes_level": level,
            "level_color": get_level_color(level), "suggestion": reading.suggestion or "",
            "predicted_bgl": reading.predicted_bgl}


def acquisition_receipt(db: Session, acquisition_id: str, actor: SensorActor) -> models.SensorAcquisition | None:
    receipt = db.get(models.SensorAcquisition, acquisition_id)
    if receipt is not None:
        if receipt.medical_personnel_id != actor.medical_id or (actor.is_device and receipt.device_id != actor_device_id(actor)):
            raise HTTPException(status_code=404, detail="Acquisition not found.")
        owned_patient(receipt.patient_id, actor.medical_id, db)
    return receipt


@router.get("/acquisitions/{acquisition_id}", response_model=schemas.ReadingResult)
def get_acquisition(acquisition_id: str, db: Session = Depends(get_db), actor: SensorActor = Depends(get_sensor_actor)):
    receipt = acquisition_receipt(db, acquisition_id, actor)
    if receipt is None:
        raise HTTPException(status_code=404, detail="Acquisition not found. Retry only the same acquisition/session and payload.")
    reading = db.get(models.Reading, receipt.reading_id) if receipt.reading_id else None
    if reading is None:
        raise HTTPException(status_code=410, detail="Acquisition was saved, but its reading was subsequently deleted. It cannot be recreated by replay.")
    patient = owned_patient(receipt.patient_id, actor.medical_id, db)
    return reading_result(schemas.ReadingResponse.model_validate(reading), patient.full_name, duplicate=True)


def replay_acquisition(db: Session, receipt: models.SensorAcquisition, data: schemas.SensorData,
                       actor: SensorActor, fingerprint: str) -> dict:
    if receipt.device_id != actor_device_id(actor) or receipt.patient_id != data.patient_id or (
            data.scan_session_id is not None and data.scan_session_id != receipt.scan_session_id) or receipt.payload_sha256 != fingerprint:
        raise HTTPException(status_code=409, detail="Acquisition ID already used with a different payload or scan binding.")
    return get_acquisition(receipt.acquisition_id, db, actor)

# ─── RECEIVE FROM ESP32 ───────────────────────────────────────────────────────
@router.post("/sensor", response_model=schemas.ReadingResult)
async def receive_sensor_data(data: schemas.SensorData, db: Session = Depends(get_db),
                              actor: SensorActor = Depends(get_sensor_actor)):
    patient_id = data.patient_id
    if patient_id is None:
        raise HTTPException(status_code=422, detail="Select a patient for this acquisition.")
    if actor.is_device and (data.scan_session_id is None or data.acquisition_id is None):
        raise HTTPException(status_code=422, detail="Device submissions require scan_session_id and acquisition_id. Poll the listener before acquiring a new scan.")
    simulation = db.get(models.SimulationRun, data.scan_session_id) if data.scan_session_id else None
    if bool(simulation) != actor.is_simulated:
        raise HTTPException(status_code=409, detail="Simulation and physical/manual acquisition channels must remain separate.")
    patient = owned_patient(patient_id, actor.medical_id, db)
    acquisition_id = data.acquisition_id or uuid4().hex
    fingerprint_payload = data.model_dump(exclude={"scan_session_id", "acquisition_id"})
    # Keep Step 2/3 receipt hashes compatible when new optional bursts are absent.
    for field in ("tgs822_samples_adc", "tgs2620_samples_adc"):
        if fingerprint_payload[field] is None:
            fingerprint_payload.pop(field)
    fingerprint = hashlib.sha256(json.dumps(fingerprint_payload,
                                            sort_keys=True, allow_nan=False, separators=(",", ":")).encode()).hexdigest()
    receipt = acquisition_receipt(db, acquisition_id, actor)
    if receipt:
        return replay_acquisition(db, receipt, data, actor, fingerprint)
    preprocessing = None
    estimation = unavailable("legacy_pipeline")
    if data.sensor_configuration == "tgs822_tgs2620":
        try:
            profile = None if actor.is_simulated else load_profile()
        except (OSError, ValueError) as exc:
            raise HTTPException(status_code=503, detail="TGS calibration profile configuration is invalid; no reading saved.") from exc
        try:
            preprocessing = preprocess(data, profile, simulated=actor.is_simulated)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Reading is outside the configured preprocessing domain; no reading saved.") from exc
        estimation = estimate_tgs(preprocessing) if actor.is_device or actor.is_simulated else unavailable("manual_entry_not_verified")
    if actor.is_simulated:
        processing = {"calibration_status": "unverified", "calibration_profile_id": None}
        acetone_ppm = level = predicted_bgl = None
        suggestion = "SIMULATED synthetic test data. Concentration, monitoring band and glucose estimate unavailable. No medical interpretation."
    elif data.sensor_configuration == "tgs822_tgs2620":
        try:
            processing = tgs_processing_metadata()
        except ValueError as exc:
            raise HTTPException(status_code=503, detail="TGS acquisition profile is incorrectly configured.") from exc
        acetone_ppm = processing["acetone_ppm"]
        level = processing["diabetes_level"]
        predicted_bgl = estimation["value"]
        suggestion = processing["suggestion"]
        if preprocessing["calibration_profile_id"] is not None:
            processing["calibration_profile_id"] = preprocessing["calibration_profile_id"]
        if predicted_bgl is not None:
            suggestion = "Raw gas-sensor features saved with an experimental glucose estimate from an explicitly enabled evaluated model. Concentration and monitoring band remain unavailable. Not medically validated."
    else:
        # Explicit compatibility path for old deployments and historical units.
        valid_signal, message = validate_breath_signal(data.raw_sensor_value, data.baseline_adc)
        if not valid_signal:
            raise HTTPException(status_code=422, detail=message)
        try:
            acetone_ppm = raw_to_ppm(data.raw_sensor_value, data.temperature, data.humidity, data.baseline_adc)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        predicted_bgl = estimate_glucose(acetone_ppm, data.temperature, data.humidity)
        if predicted_bgl is not None:
            from settings import get_setting
            estimation = {"status": "available_experimental", "reason": "legacy_evaluated_model_enabled",
                          "model_version": get_setting("BREATHDX_GLUCOSE_MODEL_VERSION") or None}
        level = classify_diabetes_level(acetone_ppm)
        suggestion = get_health_suggestion(level)
        processing = {"calibration_status": "legacy_unverified", "calibration_profile_id": None}
    reading = models.Reading(
        patient_id=patient.id,
        medical_personnel_id=actor.medical_id,
        device_id=actor_device_id(actor),
        acquisition_id=acquisition_id,
        is_simulated=actor.is_simulated,
        acetone_ppm=acetone_ppm,
        temperature=data.temperature,
        humidity=data.humidity,
        diabetes_level=level,
        raw_sensor_value=data.raw_sensor_value,
        sensor_configuration=data.sensor_configuration,
        tgs822_raw_adc=data.tgs822_raw_adc,
        tgs2620_raw_adc=data.tgs2620_raw_adc,
        tgs822_baseline_adc=data.tgs822_baseline_adc,
        tgs2620_baseline_adc=data.tgs2620_baseline_adc,
        calibration_status=processing["calibration_status"],
        calibration_profile_id=processing["calibration_profile_id"],
        suggestion=suggestion,
        predicted_bgl=predicted_bgl,
        preprocessing_version=preprocessing["preprocessing_version"] if preprocessing else None,
        preprocessing_metadata=preprocessing,
        calibration_version=preprocessing["calibration_version"] if preprocessing else None,
        model_version=estimation["model_version"],
        estimation_status=estimation["status"],
        estimation_reason=estimation["reason"],
    )
    patient_name = patient.full_name
    try:
        if data.scan_session_id:
            scan = owned_scan(db, data.scan_session_id, actor)
            if scan.patient_id != patient_id or scan.device_id != actor_device_id(actor) or scan.source != ("device" if actor.is_device else "manual") or scan.sensor_configuration != data.sensor_configuration:
                raise HTTPException(status_code=409, detail="Scan binding does not match patient, device, source or sensor configuration.")
            expire_sessions(db, actor.medical_id)
        else:
            # Older manual clients keep working; modern clients send a stable
            # acquisition ID. A compatibility manual scan does not replace a listener.
            scan = create_scan(db, actor.medical_id, patient_id, source="manual",
                               sensor_configuration=data.sensor_configuration, replace_active=False)
        changed = db.query(models.ScanSession).filter(
            models.ScanSession.id == scan.id, models.ScanSession.status.in_(ACTIVE_STATUSES),
            models.ScanSession.expires_at > utc_now(),
        ).update({"status": "completed", "finished_at": utc_now(), "active_provider_id": None,
                  **({"last_device_seen_at": utc_now()} if actor.is_device else {})}, synchronize_session="fetch")
        if not changed:
            # A concurrent winner may have committed the same acquisition.
            receipt = acquisition_receipt(db, acquisition_id, actor)
            if receipt:
                return replay_acquisition(db, receipt, data, actor, fingerprint)
            commit_scan(db)
            raise HTTPException(status_code=409, detail="Scan is completed, cancelled, expired or replaced. Start a new session for a new acquisition.")
        reading.scan_session_id = scan.id
        db.add(reading)
        db.flush()
        db.add(models.SensorAcquisition(
            acquisition_id=acquisition_id, scan_session_id=scan.id, medical_personnel_id=actor.medical_id,
            patient_id=patient_id, device_id=actor_device_id(actor), payload_sha256=fingerprint, reading_id=reading.id,
        ))
        db.flush()
        # Snapshot before commit expires ORM attributes. Never require a second
        # query after success, which could turn a saved submission into an error.
        saved_reading = schemas.ReadingResponse.model_validate(reading)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        try:
            receipt = acquisition_receipt(db, acquisition_id, actor)
            if receipt:
                return replay_acquisition(db, receipt, data, actor, fingerprint)
        except SQLAlchemyError:
            db.rollback()
        logger.error("Reading persistence failed.")
        raise HTTPException(status_code=503, detail="Acquisition save is unconfirmed. Check its status; retry only the same acquisition ID, session and payload.") from exc
    result = reading_result(saved_reading, patient_name)
    payload = {**result, "type": "reading_created", "patient_id": saved_reading.patient_id,
               "reading": saved_reading.model_dump(mode="json")}
    try:
        await socket_manager.broadcast_reading(actor.medical_id, payload)
    except Exception:
        logger.warning("Reading saved, but live notification failed.")
    return result


@router.websocket("/ws/medical")
async def medical_readings_ws(
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    # Authenticate in the first frame, never in a URL that access logs can expose.
    await websocket.accept()
    try:
        authentication = schemas.MedicalSocketAuthentication.model_validate(
            await asyncio.wait_for(websocket.receive_json(), timeout=10))
        token = authentication.token
        patient_id = authentication.patient_id
        medical_user = get_medical_from_token(token, db)
        medical_id = medical_user.id
    except HTTPException as exc:
        await websocket.close(code=1008, reason=exc.detail)
        return
    except WebSocketDisconnect:
        return
    except (TimeoutError, ValueError, ValidationError):
        await websocket.close(code=1008, reason="Authentication required.")
        return

    if patient_id is not None:
        patient = db.query(models.Patient).filter(
            models.Patient.id == patient_id,
            models.Patient.medical_personnel_id == medical_user.id
        ).first()
        if not patient:
            await websocket.close(code=1008, reason="Patient access denied.")
            return

    # Release the DB connection while the socket waits for messages.
    db.rollback()
    def subscription_valid():
        db.expire_all()
        try:
            get_medical_from_token(token, db)
            return True
        except (HTTPException, SQLAlchemyError):
            return False
        finally:
            db.rollback()
    await socket_manager.connect(medical_id, websocket, patient_id, subscription_valid)
    try:
        await websocket.send_json({"type": "connected", "message": "WebSocket connected.",
                                   "patient_id": patient_id})
        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except TimeoutError:
                message = None
            # Recheck long-lived connections after password changes or expiry.
            db.expire_all()
            try:
                get_medical_from_token(token, db)
            except HTTPException:
                await websocket.close(code=1008, reason="Session expired. Please log in again.")
                return
            finally:
                db.rollback()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        socket_manager.disconnect(medical_id, websocket)

# ─── GET ALL READINGS (Medical) ───────────────────────────────────────────────
@router.get("/all", response_model=List[schemas.ReadingResponse])
def get_all_readings(db: Session = Depends(get_db), current=Depends(get_current_medical)):
    patient_ids = [p.id for p in db.query(models.Patient).filter(
        models.Patient.medical_personnel_id == current.id).all()]
    return db.query(models.Reading).filter(
        models.Reading.patient_id.in_(patient_ids)
    ).order_by(models.Reading.taken_at.desc(), models.Reading.id.desc()).all()

# ─── GET PATIENT READINGS (Medical) ──────────────────────────────────────────
@router.get("/patient/{patient_id}", response_model=List[schemas.ReadingResponse])
def get_patient_readings(
    patient_id: int,
    db: Session = Depends(get_db),
    current=Depends(get_current_medical)
):
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id,
        models.Patient.medical_personnel_id == current.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return db.query(models.Reading).filter(
        models.Reading.patient_id == patient_id
    ).order_by(models.Reading.taken_at.desc(), models.Reading.id.desc()).all()

# ─── GET PATIENT LATEST READING (Medical) ─────────────────────────────────────
@router.get("/patient/{patient_id}/latest", response_model=schemas.ReadingResponse)
def get_patient_latest_reading(
    patient_id: int,
    db: Session = Depends(get_db),
    current=Depends(get_current_medical),
):
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id,
        models.Patient.medical_personnel_id == current.id,
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    reading = db.query(models.Reading).filter(
        models.Reading.patient_id == patient_id
    ).order_by(models.Reading.taken_at.desc(), models.Reading.id.desc()).first()
    if not reading:
        raise HTTPException(status_code=404, detail="No readings found.")
    return reading


# ─── GET MY READINGS (Patient) ────────────────────────────────────────────────
@router.get("/my", response_model=List[schemas.ReadingResponse])
def get_my_readings(db: Session = Depends(get_db), current=Depends(get_current_patient)):
    return db.query(models.Reading).filter(
        models.Reading.patient_id == current.id
    ).order_by(models.Reading.taken_at.desc(), models.Reading.id.desc()).all()

# ─── GET MY LATEST READING (Patient) ─────────────────────────────────────────
@router.get("/my/latest", response_model=schemas.ReadingResponse)
def get_my_latest(db: Session = Depends(get_db), current=Depends(get_current_patient)):
    reading = db.query(models.Reading).filter(
        models.Reading.patient_id == current.id
    ).order_by(models.Reading.taken_at.desc(), models.Reading.id.desc()).first()
    if not reading:
        raise HTTPException(status_code=404, detail="No readings found.")
    return reading

# ─── DELETE READING (Medical) ─────────────────────────────────────────────────
@router.delete("/{reading_id}")
def delete_reading(
    reading_id: int,
    db: Session = Depends(get_db),
    current=Depends(get_current_medical)
):
    reading = db.query(models.Reading).join(models.Patient).filter(
        models.Reading.id == reading_id,
        models.Patient.medical_personnel_id == current.id,
    ).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found.")
    db.query(models.SensorAcquisition).filter_by(reading_id=reading.id).update({"reading_id": None}, synchronize_session=False)
    db.delete(reading)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Reading deletion could not be saved.") from exc
    return {"message": "Reading deleted successfully."}
