from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import Dict, List, Optional, Tuple
from database import get_db
from auth import get_current_medical, get_current_patient, get_medical_from_token
from classifier import raw_to_ppm, classify_diabetes_level, get_level_color, get_health_suggestion
import models, schemas
from ml_model import predict_glucose


router = APIRouter()


class MedicalSocketManager:
    def __init__(self):
        self.connections: Dict[int, List[Tuple[WebSocket, Optional[int]]]] = {}

    async def connect(self, medical_id: int, websocket: WebSocket, patient_id: Optional[int]):
        await websocket.accept()
        self.connections.setdefault(medical_id, []).append((websocket, patient_id))

    def disconnect(self, medical_id: int, websocket: WebSocket):
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
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(medical_id, websocket)


socket_manager = MedicalSocketManager()

# ─── RECEIVE FROM ESP32 ───────────────────────────────────────────────────────
@router.post("/sensor", response_model=schemas.ReadingResult)
async def receive_sensor_data(data: schemas.SensorData, db: Session = Depends(get_db)):
    patient = db.query(models.Patient).filter(models.Patient.id == data.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    acetone_ppm = raw_to_ppm(data.raw_sensor_value, data.temperature, data.humidity)
    level = classify_diabetes_level(acetone_ppm)
    color = get_level_color(level)
    suggestion = get_health_suggestion(level)
    reading = models.Reading(
        patient_id=data.patient_id,
        acetone_ppm=acetone_ppm,
        temperature=data.temperature,
        humidity=data.humidity,
        diabetes_level=level,
        raw_sensor_value=data.raw_sensor_value,
        suggestion=suggestion
    )
    db.add(reading)
    db.commit()
    db.refresh(reading)
    payload = {
        "type": "reading_created",
        "patient_id": reading.patient_id,
        "patient_name": patient.full_name,
        "reading": {
            "id": reading.id,
            "acetone_ppm": reading.acetone_ppm,
            "temperature": reading.temperature,
            "humidity": reading.humidity,
            "diabetes_level": reading.diabetes_level.value if hasattr(reading.diabetes_level, "value") else reading.diabetes_level,
            "raw_sensor_value": reading.raw_sensor_value,
            "suggestion": reading.suggestion,
            "taken_at": reading.taken_at.isoformat(),
        },
        "acetone_ppm": acetone_ppm,
        "diabetes_level": level,
        "level_color": color,
        "suggestion": suggestion,
    }
    await socket_manager.broadcast_reading(patient.medical_personnel_id, payload)
    return {
        "reading": reading,
        "patient_name": patient.full_name,
        "acetone_ppm": acetone_ppm,
        "diabetes_level": level,
        "level_color": color,
        "suggestion": suggestion
    }


@router.websocket("/ws/medical")
async def medical_readings_ws(
    websocket: WebSocket,
    token: str = Query(...),
    patient_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    try:
        medical_user = get_medical_from_token(token, db)
    except HTTPException as exc:
        await websocket.close(code=1008, reason=exc.detail)
        return

    if patient_id is not None:
        patient = db.query(models.Patient).filter(
            models.Patient.id == patient_id,
            models.Patient.medical_personnel_id == medical_user.id
        ).first()
        if not patient:
            await websocket.close(code=1008, reason="Patient access denied.")
            return

    await socket_manager.connect(medical_user.id, websocket, patient_id)
    await websocket.send_json({
        "type": "connected",
        "message": "WebSocket connected.",
        "patient_id": patient_id,
    })

    try:
        while True:
            message = await websocket.receive_text()
            if message == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        socket_manager.disconnect(medical_user.id, websocket)

# ─── GET ALL READINGS (Medical) ───────────────────────────────────────────────
@router.get("/all", response_model=List[schemas.ReadingResponse])
def get_all_readings(db: Session = Depends(get_db), current=Depends(get_current_medical)):
    patient_ids = [p.id for p in db.query(models.Patient).filter(
        models.Patient.medical_personnel_id == current.id).all()]
    return db.query(models.Reading).filter(
        models.Reading.patient_id.in_(patient_ids)
    ).order_by(models.Reading.taken_at.desc()).all()

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
    ).order_by(models.Reading.taken_at.desc()).all()

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
    ).order_by(models.Reading.taken_at.desc()).first()
    if not reading:
        raise HTTPException(status_code=404, detail="No readings found.")
    return reading


# ─── GET MY READINGS (Patient) ────────────────────────────────────────────────
@router.get("/my", response_model=List[schemas.ReadingResponse])
def get_my_readings(db: Session = Depends(get_db), current=Depends(get_current_patient)):
    return db.query(models.Reading).filter(
        models.Reading.patient_id == current.id
    ).order_by(models.Reading.taken_at.desc()).all()

# ─── GET MY LATEST READING (Patient) ─────────────────────────────────────────
@router.get("/my/latest", response_model=schemas.ReadingResponse)
def get_my_latest(db: Session = Depends(get_db), current=Depends(get_current_patient)):
    reading = db.query(models.Reading).filter(
        models.Reading.patient_id == current.id
    ).order_by(models.Reading.taken_at.desc()).first()
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
    reading = db.query(models.Reading).filter(models.Reading.id == reading_id).first()
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found.")
    db.delete(reading)
    db.commit()
    return {"message": "Reading deleted successfully."}