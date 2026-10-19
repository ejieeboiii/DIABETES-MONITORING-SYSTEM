from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware

from database import engine

import models

from routes_auth import router as auth_router

from routes_patients import router as patients_router

from routes_readings import router as readings_router
from settings import get_allowed_origins
from fastapi.exceptions import RequestValidationError
from error_handlers import request_validation_error
from migrate_sensor_configuration import require_sensor_schema
from migrate_scan_workflow import require_scan_schema
from migrate_simulation import require_simulation_schema
from migrate_preprocessing import require_preprocessing_schema
from sqlalchemy import inspect



if inspect(engine).has_table("readings"):
    # Existing installations must be backed up/migrated explicitly, before DDL.
    require_sensor_schema(engine)
    require_scan_schema(engine)
    require_simulation_schema(engine)
    require_preprocessing_schema(engine)
models.Base.metadata.create_all(bind=engine)
require_sensor_schema(engine)
require_scan_schema(engine)
require_simulation_schema(engine)
require_preprocessing_schema(engine)



app = FastAPI(

    title="BreathDx — Non-Invasive Diabetes Monitoring System",

    description="Breath analysis system for diabetes health monitoring",

    version="2.0.0"

)



app.add_middleware(

    CORSMiddleware,

    allow_origins=get_allowed_origins(),

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)
app.add_exception_handler(RequestValidationError, request_validation_error)



app.include_router(auth_router,     prefix="/auth",     tags=["Authentication"])

app.include_router(patients_router, prefix="/patients", tags=["Patients"])

app.include_router(readings_router, prefix="/readings", tags=["Readings & Sensor"])



@app.get("/")

def root():

    return {

        "system": "BreathDx — Non-Invasive Diabetes Monitoring System",

        "version": "2.0.0",

        "status": "running",

        "roles": ["Medical Personnel", "Patient"],

        "docs": "/docs"

    }



@app.get("/health")

def health():

    return {"status": "ok"}
