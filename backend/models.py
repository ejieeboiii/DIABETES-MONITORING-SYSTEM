from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum, Index, CheckConstraint, Boolean, JSON

from sqlalchemy.orm import relationship

from database import Base

from datetime import datetime

import enum



class DiabetesLevel(str, enum.Enum):

    NORMAL = "Normal"

    PRE_DIABETIC = "Pre-Diabetic"

    DIABETIC = "Diabetic"



# ─── MEDICAL PERSONNEL ───────────────────────────────────────────────────────

class MedicalPersonnel(Base):

    __tablename__ = "medical_personnel"



    id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String, nullable=False)

    email = Column(String, unique=True, index=True, nullable=False)

    hashed_password = Column(String, nullable=False)

    profession = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)



    patients = relationship("Patient", back_populates="medical_personnel")





# ─── PATIENT ─────────────────────────────────────────────────────────────────

class Patient(Base):

    __tablename__ = "patients"



    id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String, nullable=False)

    email = Column(String, unique=True, index=True, nullable=False)

    hashed_password = Column(String, nullable=False)

    age = Column(Integer, nullable=False)

    gender = Column(String, nullable=False)

    contact = Column(String, nullable=True)

    is_diabetic = Column(String, nullable=True)

    medical_personnel_id = Column(Integer, ForeignKey("medical_personnel.id"), nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)



    medical_personnel = relationship("MedicalPersonnel", back_populates="patients")

    readings = relationship("Reading", back_populates="patient")





# ─── READING ─────────────────────────────────────────────────────────────────

class Reading(Base):

    __tablename__ = "readings"
    __table_args__ = (Index("ux_readings_acquisition_id", "acquisition_id", unique=True),)



    id = Column(Integer, primary_key=True, index=True)

    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    # Historical rows remain null: acquisition provenance cannot be invented.
    medical_personnel_id = Column(Integer, ForeignKey("medical_personnel.id"), nullable=True)
    device_id = Column(String, nullable=True)
    scan_session_id = Column(String, ForeignKey("scan_sessions.id"), nullable=True)
    acquisition_id = Column(String, nullable=True)
    is_simulated = Column(Boolean, nullable=False, default=False, server_default="0")
    preprocessing_version = Column(String, nullable=True)
    preprocessing_metadata = Column(JSON, nullable=True)
    calibration_version = Column(String, nullable=True)
    model_version = Column(String, nullable=True)
    estimation_status = Column(String, nullable=True)
    estimation_reason = Column(String, nullable=True)

    acetone_ppm = Column(Float, nullable=True)

    temperature = Column(Float, nullable=False)

    humidity = Column(Float, nullable=False)

    diabetes_level = Column(Enum(DiabetesLevel), nullable=True)

    raw_sensor_value = Column(Integer, nullable=True)

    # Legacy ADC is never relabelled as a TGS measurement.
    sensor_configuration = Column(String, nullable=False, default="mq138_legacy", server_default="mq138_legacy")
    tgs822_raw_adc = Column(Integer, nullable=True)
    tgs2620_raw_adc = Column(Integer, nullable=True)
    tgs822_baseline_adc = Column(Integer, nullable=True)
    tgs2620_baseline_adc = Column(Integer, nullable=True)
    calibration_status = Column(String, nullable=False, default="legacy_unverified", server_default="legacy_unverified")
    calibration_profile_id = Column(String, nullable=True)

    suggestion = Column(String, nullable=True)

    predicted_bgl = Column(Float, nullable=True)  # Linear Regression predicted Blood Glucose Level

    taken_at = Column(DateTime, default=datetime.utcnow)



    patient = relationship("Patient", back_populates="readings")


class ScanSession(Base):
    __tablename__ = "scan_sessions"
    __table_args__ = (
        Index("ux_scan_active_provider", "active_provider_id", unique=True),
        Index("ix_scan_provider_created", "medical_personnel_id", "created_at"),
        CheckConstraint("status IN ('pending','collecting','completed','cancelled','expired','replaced')", name="ck_scan_status"),
        CheckConstraint("source IN ('device','manual')", name="ck_scan_source"),
    )

    id = Column(String, primary_key=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    medical_personnel_id = Column(Integer, ForeignKey("medical_personnel.id"), nullable=False)
    device_id = Column(String, nullable=False)
    source = Column(String, nullable=False)
    sensor_configuration = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    # One active listener per provider; manual entry does not displace it.
    active_provider_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    finished_at = Column(DateTime, nullable=True)
    last_device_seen_at = Column(DateTime, nullable=True)


class SensorAcquisition(Base):
    __tablename__ = "sensor_acquisitions"
    __table_args__ = (Index("ux_acquisition_session", "scan_session_id", unique=True),)

    acquisition_id = Column(String, primary_key=True)
    scan_session_id = Column(String, ForeignKey("scan_sessions.id"), nullable=False)
    medical_personnel_id = Column(Integer, ForeignKey("medical_personnel.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    device_id = Column(String, nullable=False)
    payload_sha256 = Column(String, nullable=False)
    # Receipt survives deliberate reading deletion, preventing replay recreation.
    reading_id = Column(Integer, ForeignKey("readings.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class SimulationRun(Base):
    """Synthetic acquisition state; never polled by physical firmware."""
    __tablename__ = "simulation_runs"
    session_id = Column(String, ForeignKey("scan_sessions.id"), primary_key=True)
    acquisition_id = Column(String, nullable=False, unique=True)
    configuration_json = Column(String, nullable=False)
    payload_json = Column(String, nullable=False)
    stage = Column(String, nullable=False, default="instructions")
    stage_started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    error = Column(String, nullable=True)
