from pydantic import BaseModel, EmailStr, Field, field_serializer, field_validator, model_validator
from datetime import datetime, timezone
from typing import Optional, List, Literal, Annotated
from models import DiabetesLevel
from uuid import UUID


def normalize_identifier(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if len(value) not in (32, 36):
        raise ValueError("Use a UUID acquisition/session identifier.")
    try:
        return UUID(value).hex
    except ValueError as exc:
        raise ValueError("Use a UUID acquisition/session identifier.") from exc

# ─── MEDICAL PERSONNEL ───────────────────────────────────────────────────────
class MedicalRegister(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: str
    profession: Optional[str] = Field(default="Doctor", max_length=100)

    @field_validator("full_name", "profession", mode="before")
    @classmethod
    def trim_profile_text(cls, value):
        return value.strip() if isinstance(value, str) else value

class MedicalLogin(BaseModel):
    email: EmailStr
    password: str

class UTCResponse(BaseModel):
    @field_serializer("created_at", "taken_at", "expires_at", "finished_at", "last_device_seen_at", check_fields=False)
    def serialize_timestamp(self, value: Optional[datetime]) -> Optional[str]:
        if value is None:
            return None
        # Historical SQLite timestamps are naive UTC; do not reinterpret as local.
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat()


class MedicalResponse(UTCResponse):
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
    full_name: str = Field(min_length=1, max_length=150)
    email: EmailStr
    password: str
    age: int = Field(ge=0, le=130, strict=True)
    gender: str = Field(min_length=1, max_length=30)
    contact: Optional[str] = Field(default=None, max_length=100)
    is_diabetic: Optional[str] = Field(default="Unknown", max_length=50)

    @field_validator("full_name", "gender", "contact", "is_diabetic", mode="before")
    @classmethod
    def trim_patient_text(cls, value):
        return value.strip() if isinstance(value, str) else value

class PatientResponse(UTCResponse):
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


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=72)

    @field_validator("new_password")
    @classmethod
    def validate_password_bytes(cls, value: str) -> str:
        try:
            byte_length = len(value.encode("utf-8"))
        except UnicodeError as exc:
            raise ValueError("Password must be valid UTF-8 text.") from exc
        if byte_length > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes.")
        return value


class ProviderProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    profession: Optional[str] = Field(default=None, max_length=100)

    model_config = {"extra": "forbid", "str_strip_whitespace": True}


class PatientProfileUpdate(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)
    contact: Optional[str] = Field(default=None, max_length=100)

    model_config = {"extra": "forbid", "str_strip_whitespace": True}


class PatientDetailsUpdate(PatientProfileUpdate):
    age: int = Field(ge=0, le=130, strict=True)
    gender: str = Field(min_length=1, max_length=30)
    is_diabetic: Optional[str] = Field(default="Unknown", max_length=50)


# ─── READING ─────────────────────────────────────────────────────────────────
class SensorData(BaseModel):
    patient_id: Optional[int] = Field(default=None, gt=0, strict=True)
    scan_session_id: Optional[str] = Field(default=None, strict=True)
    acquisition_id: Optional[str] = Field(default=None, strict=True)
    sensor_configuration: Literal["tgs822_tgs2620", "mq138_legacy"] = "tgs822_tgs2620"
    tgs822_raw_adc: Optional[int] = Field(default=None, ge=1, le=4094, strict=True)
    tgs2620_raw_adc: Optional[int] = Field(default=None, ge=1, le=4094, strict=True)
    tgs822_baseline_adc: Optional[int] = Field(default=None, ge=0, le=4094, strict=True)
    tgs2620_baseline_adc: Optional[int] = Field(default=None, ge=0, le=4094, strict=True)
    tgs822_samples_adc: Optional[List[Annotated[int, Field(ge=1, le=4094, strict=True)]]] = Field(default=None, min_length=3, max_length=512)
    tgs2620_samples_adc: Optional[List[Annotated[int, Field(ge=1, le=4094, strict=True)]]] = Field(default=None, min_length=3, max_length=512)
    raw_sensor_value: Optional[int] = Field(default=None, ge=1, le=4094, strict=True)
    baseline_adc: Optional[int] = Field(default=None, ge=0, le=4094, strict=True)
    temperature: float = Field(ge=-40, le=80, allow_inf_nan=False, strict=True)
    humidity: float = Field(ge=0, le=100, allow_inf_nan=False, strict=True)

    model_config = {"extra": "forbid"}

    _identifiers = field_validator("scan_session_id", "acquisition_id")(normalize_identifier)

    @model_validator(mode="before")
    @classmethod
    def identify_legacy_payload(cls, value):
        # Compatibility for previously deployed clients, never for new firmware.
        if isinstance(value, dict) and "sensor_configuration" not in value and "raw_sensor_value" in value:
            return {**value, "sensor_configuration": "mq138_legacy"}
        return value

    @model_validator(mode="after")
    def validate_sensor_pair(self):
        tgs_fields = (self.tgs822_raw_adc, self.tgs2620_raw_adc,
                      self.tgs822_baseline_adc, self.tgs2620_baseline_adc,
                      self.tgs822_samples_adc, self.tgs2620_samples_adc)
        if self.sensor_configuration == "tgs822_tgs2620":
            if self.tgs822_raw_adc is None or self.tgs2620_raw_adc is None:
                raise ValueError("Both TGS822 and TGS2620 raw ADC readings are required.")
            if self.raw_sensor_value is not None or self.baseline_adc is not None:
                raise ValueError("Legacy MQ-138 fields cannot be mixed with TGS measurements.")
        elif self.raw_sensor_value is None or any(value is not None for value in tgs_fields):
            raise ValueError("Legacy submissions require only the legacy gas ADC fields.")
        return self


class ListenerArmRequest(BaseModel):
    patient_id: int = Field(gt=0, strict=True)
    model_config = {"extra": "forbid"}


class ListenerStopRequest(BaseModel):
    session_id: str = Field(strict=True)
    _identifier = field_validator("session_id")(normalize_identifier)
    model_config = {"extra": "forbid"}


class ScanStartRequest(ListenerArmRequest):
    source: Literal["device", "manual"] = "device"
    sensor_configuration: Literal["tgs822_tgs2620", "mq138_legacy"] = "tgs822_tgs2620"
    timeout_seconds: int = Field(default=900, ge=15, le=900, strict=True)


class ScanSessionResponse(UTCResponse):
    session_id: str
    patient_id: int
    medical_personnel_id: int
    device_id: str
    source: Literal["device", "manual"]
    sensor_configuration: Literal["tgs822_tgs2620", "mq138_legacy"]
    status: Literal["pending", "collecting", "completed", "cancelled", "expired", "replaced"]
    created_at: datetime
    expires_at: datetime
    finished_at: Optional[datetime]
    last_device_seen_at: Optional[datetime]
    device_connection: Literal["unknown", "connected", "disconnected", "not_applicable"]
    reading_id: Optional[int] = None
    acquisition_id: Optional[str] = None


class MedicalSocketAuthentication(BaseModel):
    type: Literal["authenticate"]
    token: str = Field(min_length=1, max_length=4096)
    patient_id: Optional[int] = Field(default=None, gt=0)

    model_config = {"extra": "forbid"}


class ArmedPatientResponse(UTCResponse):
    armed: bool
    patient_id: Optional[int] = None
    patient_name: Optional[str] = None
    message: Optional[str] = None
    session_id: Optional[str] = None
    device_id: Optional[str] = None
    status: Optional[str] = None
    expires_at: Optional[datetime] = None

class ReadingResponse(UTCResponse):
    id: int
    patient_id: int
    medical_personnel_id: Optional[int] = None
    device_id: Optional[str] = None
    scan_session_id: Optional[str] = None
    acquisition_id: Optional[str] = None
    is_simulated: bool = False
    preprocessing_version: Optional[str] = None
    preprocessing_metadata: Optional[dict] = None
    calibration_version: Optional[str] = None
    model_version: Optional[str] = None
    estimation_status: Optional[str] = None
    estimation_reason: Optional[str] = None
    acetone_ppm: Optional[float]
    temperature: float
    humidity: float
    diabetes_level: Optional[DiabetesLevel]
    raw_sensor_value: Optional[int]
    sensor_configuration: Literal["tgs822_tgs2620", "mq138_legacy"]
    tgs822_raw_adc: Optional[int] = None
    tgs2620_raw_adc: Optional[int] = None
    tgs822_baseline_adc: Optional[int] = None
    tgs2620_baseline_adc: Optional[int] = None
    calibration_status: Literal["unverified", "legacy_unverified"]
    calibration_profile_id: Optional[str] = None
    suggestion: Optional[str]
    taken_at: datetime
    predicted_bgl: Optional[float] = None  # Linear Regression predicted Blood Glucose Level
    class Config:
        from_attributes = True

class ReadingResult(BaseModel):
    reading: ReadingResponse
    patient_name: str
    duplicate: bool = False
    acetone_ppm: Optional[float]
    diabetes_level: Optional[str]
    level_color: str
    suggestion: str
    predicted_bgl: Optional[float] = None  # Linear Regression predicted Blood Glucose Level

class TrendData(BaseModel):
    date: str
    acetone_ppm: float
    diabetes_level: str
