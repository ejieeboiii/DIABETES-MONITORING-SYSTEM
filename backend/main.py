from fastapi import FastAPI

from fastapi.middleware.cors import CORSMiddleware

from database import engine

import models

from routes_auth import router as auth_router

from routes_patients import router as patients_router

from routes_readings import router as readings_router



models.Base.metadata.create_all(bind=engine)



app = FastAPI(

    title="BreathDx — Non-Invasive Diabetes Monitoring System",

    description="Breath analysis system for diabetes health monitoring",

    version="2.0.0"

)



app.add_middleware(

    CORSMiddleware,

    allow_origins=["*"],

    allow_credentials=True,

    allow_methods=["*"],

    allow_headers=["*"],

)



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
