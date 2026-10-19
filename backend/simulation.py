"""Provider-authenticated scripted simulation using the existing scan transaction.

Phase timing is a software test script, not a physical breath-detection algorithm.
No background worker: advancing is explicit and durable, so interrupted clients
can resume the same session without generating a fresh acquisition.
"""
import json
import random
from uuid import uuid4

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator
from sqlalchemy.orm import Session

import models
import schemas
from auth import get_current_medical
from database import get_db
from listener_session import create_scan, owned_scan, expire_sessions, utc_now, ACTIVE_STATUSES, cancel_scan, session_response
from sensor_auth import SensorActor


class ADCRange(BaseModel):
    minimum: int = Field(ge=1, le=4094, strict=True)
    maximum: int = Field(ge=1, le=4094, strict=True)
    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def ordered(self):
        if self.minimum > self.maximum:
            raise ValueError("Range minimum must not exceed maximum.")
        return self


class BaselineRange(ADCRange):
    # The existing ingestion contract allows zero baseline counts.
    minimum: int = Field(ge=0, le=4094, strict=True)
    maximum: int = Field(ge=0, le=4094, strict=True)


class TemperatureRange(BaseModel):
    minimum: float = Field(ge=-40, le=80, allow_inf_nan=False, strict=True)
    maximum: float = Field(ge=-40, le=80, allow_inf_nan=False, strict=True)
    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def ordered(self):
        if self.minimum > self.maximum:
            raise ValueError("Range minimum must not exceed maximum.")
        return self


class HumidityRange(TemperatureRange):
    minimum: float = Field(ge=0, le=100, allow_inf_nan=False, strict=True)
    maximum: float = Field(ge=0, le=100, allow_inf_nan=False, strict=True)


class SimulationStart(schemas.ListenerArmRequest):
    session_id: str = Field(strict=True)
    _identifier = field_validator("session_id")(schemas.normalize_identifier)
    timeout_seconds: int = Field(default=120, ge=15, le=900, strict=True)
    stage_seconds: float = Field(default=2, ge=0.5, le=10, allow_inf_nan=False, strict=True)
    tgs822: ADCRange = Field(default_factory=lambda: ADCRange(minimum=1100, maximum=1600))
    tgs2620: ADCRange = Field(default_factory=lambda: ADCRange(minimum=1300, maximum=1800))
    tgs822_baseline: BaselineRange = Field(default_factory=lambda: BaselineRange(minimum=700, maximum=1000))
    tgs2620_baseline: BaselineRange = Field(default_factory=lambda: BaselineRange(minimum=800, maximum=1100))
    temperature: TemperatureRange = Field(default_factory=lambda: TemperatureRange(minimum=24, maximum=30))
    humidity: HumidityRange = Field(default_factory=lambda: HumidityRange(minimum=40, maximum=70))


def simulation_actor(medical_id: int) -> SensorActor:
    return SensorActor(medical_id, device_id=f"simulator-provider-{medical_id}", is_simulated=True)


def load_run(db: Session, session_id: str, medical_id: int):
    scan = owned_scan(db, session_id, SensorActor(medical_id))
    run = db.get(models.SimulationRun, session_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Simulation not found.")
    # Patient ownership is checked even after a provider-scoped session lookup.
    from routes_readings import owned_patient
    owned_patient(scan.patient_id, medical_id, db)
    expire_sessions(db, medical_id)  # also serializes transitions under SQLite's write lock
    db.refresh(run)
    db.refresh(scan)
    return scan, run


def snapshot(db: Session, scan, run) -> dict:
    from routes_readings import get_acquisition
    status = run.stage
    if scan.status != "completed" and scan.status not in ACTIVE_STATUSES:
        status = "failed" if run.stage == "failed" else {"expired": "timed_out", "replaced": "replaced"}.get(scan.status, "cancelled")
    reading = None
    if scan.status == "completed":
        status = "completed"
        receipt = db.get(models.SensorAcquisition, run.acquisition_id)
        if receipt and receipt.reading_id:
            reading = get_acquisition(run.acquisition_id, db, SensorActor(scan.medical_personnel_id))["reading"]
    stages = ("instructions", "waiting", "detecting", "capturing", "processing", "completed")
    return {**session_response(db, scan), "is_simulated": True, "stage": status,
            "progress": stages.index(status) * 20 if status in stages else 0,
            "acquisition_id": run.acquisition_id, "reading": reading, "error": run.error,
            "configuration": json.loads(run.configuration_json)}


def register_routes(router):
    @router.post("/simulations")
    def start(data: SimulationStart, db: Session = Depends(get_db), current=Depends(get_current_medical)):
        from routes_readings import owned_patient, commit_scan
        owned_patient(data.patient_id, current.id, db)
        configuration = data.model_dump(exclude={"session_id"})
        # Acquire the same write lock used by scan replacement before rechecking.
        expire_sessions(db, current.id)
        existing = db.get(models.ScanSession, data.session_id, populate_existing=True)
        if existing:
            scan, run = load_run(db, data.session_id, current.id)
            if json.loads(run.configuration_json) != configuration:
                raise HTTPException(status_code=409, detail="Simulation ID already used with different settings.")
        else:
            scan = create_scan(db, current.id, data.patient_id, source="manual",
                               timeout_seconds=data.timeout_seconds, session_id=data.session_id)
            scan.device_id = simulation_actor(current.id).device_id
            generator = random.SystemRandom()
            acquisition_id = uuid4().hex
            payload = {"patient_id": data.patient_id, "scan_session_id": scan.id,
                       "acquisition_id": acquisition_id, "sensor_configuration": "tgs822_tgs2620"}
            for field, bounds in (("tgs822_raw_adc", data.tgs822), ("tgs2620_raw_adc", data.tgs2620),
                                  ("tgs822_baseline_adc", data.tgs822_baseline), ("tgs2620_baseline_adc", data.tgs2620_baseline)):
                payload[field] = generator.randint(bounds.minimum, bounds.maximum)
            for field, bounds in (("temperature", data.temperature), ("humidity", data.humidity)):
                payload[field] = round(generator.uniform(bounds.minimum, bounds.maximum), 2)
                # Keep decimal rounding inside even very narrow configured ranges.
                payload[field] = min(bounds.maximum, max(bounds.minimum, payload[field]))
            schemas.SensorData.model_validate(payload)
            run = models.SimulationRun(session_id=scan.id, acquisition_id=acquisition_id,
                                       configuration_json=json.dumps(configuration, sort_keys=True),
                                       payload_json=json.dumps(payload), stage="instructions", stage_started_at=utc_now())
            db.add(run)
            db.flush()
        response = snapshot(db, scan, run)
        commit_scan(db)
        return response

    @router.get("/simulations/{session_id}")
    def monitor(session_id: str, db: Session = Depends(get_db), current=Depends(get_current_medical)):
        from routes_readings import commit_scan
        scan, run = load_run(db, session_id, current.id)
        response = snapshot(db, scan, run)
        commit_scan(db)
        return response

    @router.post("/simulations/{session_id}/advance")
    async def advance(session_id: str, db: Session = Depends(get_db), current=Depends(get_current_medical)):
        from routes_readings import commit_scan, receive_sensor_data
        scan, run = load_run(db, session_id, current.id)
        if scan.status in ACTIVE_STATUSES:
            configuration = json.loads(run.configuration_json)
            elapsed = (utc_now() - run.stage_started_at).total_seconds()
            if run.stage == "instructions" or elapsed >= configuration["stage_seconds"]:
                stages = ("instructions", "waiting", "detecting", "capturing", "processing")
                if run.stage not in stages:
                    raise HTTPException(status_code=409, detail="Simulation state is invalid.")
                if run.stage == "processing":
                    try:
                        payload = schemas.SensorData.model_validate_json(run.payload_json)
                        if payload.sensor_configuration != "tgs822_tgs2620" or payload.patient_id != scan.patient_id or payload.scan_session_id != scan.id or payload.acquisition_id != run.acquisition_id:
                            raise ValueError("Invalid simulation binding")
                    except (ValidationError, ValueError):
                        cancel_scan(db, scan)
                        run.stage = "failed"
                        run.error = "Synthetic sample failed validation. No reading was saved. Start a new test."
                    else:
                        # Run completion and reading/receipt save share one commit.
                        run.stage = "completed"
                        db.flush()
                        await receive_sensor_data(payload, db, simulation_actor(current.id))
                else:
                    run.stage = stages[stages.index(run.stage) + 1]
                    run.stage_started_at = utc_now()
                    scan.status = "collecting"
                    db.flush()
        response = snapshot(db, scan, run)
        commit_scan(db)
        return response
