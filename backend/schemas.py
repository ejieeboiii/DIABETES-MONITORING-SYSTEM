from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List
from models import DiabetesLevel

# ─── MEDICAL PERSONNEL ───────────────────────────────────────────────────────
class MedicalRegister(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    profession: Optional[str] = "Doctor"

class MedicalLogin(BaseModel):
    email: EmailStr
    password: str

class MedicalResponse(BaseModel):
    id: int
    full_name: str
    email: str
    profession: Optional[str]
    created_at: datetime
    class Config:
        from_attributes = True

class MedicalTokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    user: MedicalResponse


# ─── PATIENT AUTH ─────────────────────────────────────────────────────────────
class PatientLogin(BaseModel):
    email: EmailStr
    password: str

class PatientTokenResponse(BaseModel):
    access_token: str
    token_type: str
    role: str
    user: 'PatientResponse'


# ─── PATIENT ─────────────────────────────────────────────────────────────────
class PatientCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    age: int
    gender: str
    contact: Optional[str] = None
    is_diabetic: Optional[str] = "Unknown"

class PatientResponse(BaseModel):
    id: int
    full_name: str
    email: str
    age: int
    gender: str
    contact: Optional[str]
    is_diabetic: Optional[str]
    medical_personnel_id: int
    created_at: datetime
    class Config:
        from_attributes = True

class PatientResetPassword(BaseModel):
    new_password: Optional[str] = None

class PatientCredentialsOnce(BaseModel):
    email: str
    temporary_password: str
    message: str


# ─── READING ─────────────────────────────────────────────────────────────────
class SensorData(BaseModel):
    patient_id: Optional[int] = None
    raw_sensor_value: int
    baseline_adc: Optional[int] = None
    temperature: float
    humidity: float


class ListenerArmRequest(BaseModel):
    patient_id: int


class ArmedPatientResponse(BaseModel):
    armed: bool
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    message: Optional[str] = None

class ReadingResponse(BaseModel):
    id: int
    patient_id: int
    acetone_ppm: float
    temperature: float
    humidity: float
    diabetes_level: DiabetesLevel
    raw_sensor_value: Optional[int]
    suggestion: Optional[str]
    taken_at: datetime
    predicted_bgl: Optional[float] = None  # Linear Regression predicted Blood Glucose Level
    class Config:
        from_attributes = True

class ReadingResult(BaseModel):
    reading: ReadingResponse
    patient_name: str
    acetone_ppm: float
    diabetes_level: str
    level_color: str
    suggestion: str
    predicted_bgl: Optional[float] = None  # Linear Regression predicted Blood Glucose Level

class TrendData(BaseModel):
    date: str
    acetone_ppm: float
    diabetes_level: str