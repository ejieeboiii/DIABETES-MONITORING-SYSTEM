from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum

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



    id = Column(Integer, primary_key=True, index=True)

    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)

    acetone_ppm = Column(Float, nullable=False)

    temperature = Column(Float, nullable=False)

    humidity = Column(Float, nullable=False)

    diabetes_level = Column(Enum(DiabetesLevel), nullable=False)

    raw_sensor_value = Column(Integer, nullable=True)

    suggestion = Column(String, nullable=True)

    predicted_bgl = Column(Float, nullable=True)  # Linear Regression predicted Blood Glucose Level

    taken_at = Column(DateTime, default=datetime.utcnow)



    patient = relationship("Patient", back_populates="readings")