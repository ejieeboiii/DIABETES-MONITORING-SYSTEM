"""Loopback-only UI verification fixture. Never run against the patient database.

From backend: venv/Scripts/python.exe -B -m uvicorn ui_fixture:app --app-dir tests
  --host 127.0.0.1 --port 8012 --no-access-log
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
import os
import secrets
from unittest.mock import patch

with patch.dict(os.environ, {"BREATHDX_JWT_SECRET": secrets.token_urlsafe(48)}):
    from auth import hash_password
from database import Base, get_db
from error_handlers import request_validation_error
import models
from routes_auth import router as auth_router
from routes_patients import router as patients_router
from routes_readings import router as readings_router
import routes_readings

# This fixture never loads the configured patient-facing model artifact.
routes_readings.estimate_glucose = lambda *_: None

engine = create_engine("sqlite:///file:breathdx-ui-fixture?mode=memory&cache=shared&uri=true",
                       connect_args={"check_same_thread": False}, poolclass=QueuePool)
Base.metadata.create_all(engine)
sessions = sessionmaker(bind=engine)
with sessions() as db:
    db.add(models.MedicalPersonnel(id=1, full_name="Demo Provider", email="demo@example.com",
                                  hashed_password=hash_password("Test-Only-Password")))
    db.flush()
    db.add(models.Patient(id=1, full_name="Demo Patient", email="patient@example.com", age=30,
                          gender="Other", is_diabetic="Unknown", medical_personnel_id=1,
                          hashed_password=hash_password("Test-Only-Password")))
    db.commit()

app = FastAPI()
app.include_router(auth_router, prefix="/auth")
app.include_router(patients_router, prefix="/patients")
app.include_router(readings_router, prefix="/readings")
app.add_exception_handler(RequestValidationError, request_validation_error)


def fixture_db():
    with sessions() as db:
        yield db


app.dependency_overrides[get_db] = fixture_db

# Test-only fault injection verifies session restoration without losing the
# in-memory accounts. This control exists only in this disposable fixture app.
unavailable = False


@app.middleware("http")
async def simulated_service_failure(request, call_next):
    if unavailable and not request.url.path.startswith("/__test/"):
        return JSONResponse(status_code=503, content={"detail": "Synthetic service interruption. Please retry."})
    return await call_next(request)


@app.post("/__test/unavailable")
async def toggle_service_failure(enabled: bool = False):
    global unavailable
    unavailable = enabled
    return {"enabled": enabled}


@app.get("/__test/simulation-summary")
def simulation_summary():
    """Test-only aggregate verification; this router never joins the real app."""
    with sessions() as db:
        readings = db.query(models.Reading).all()
        return {"saved_readings": len(readings), "acquisitions": db.query(models.SensorAcquisition).count(),
                "simulated_readings": sum(bool(reading.is_simulated) for reading in readings),
                "unique_acquisitions": len({reading.acquisition_id for reading in readings}),
                "unique_sessions": len({reading.scan_session_id for reading in readings}),
                "correct_patient": all(db.get(models.Patient, reading.patient_id) is not None
                                       and db.get(models.Patient, reading.patient_id).medical_personnel_id == reading.medical_personnel_id for reading in readings),
                "medical_outputs_unavailable": all(reading.acetone_ppm is None and reading.diabetes_level is None and reading.predicted_bgl is None for reading in readings)}
