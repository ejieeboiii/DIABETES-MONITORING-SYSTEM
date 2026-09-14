from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
import models

SECRET_KEY = "breathdx-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# ─── Password ─────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

# ─── Token ────────────────────────────────────────────────────────────────────
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_medical_from_token(token: str, db: Session) -> models.MedicalPersonnel:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "medical":
            raise HTTPException(status_code=403, detail="Access denied. Medical personnel only.")
        user_id = payload.get("user_id")
        user = db.query(models.MedicalPersonnel).filter(models.MedicalPersonnel.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token.")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

# ─── Get Current Medical Personnel ───────────────────────────────────────────
def get_current_medical(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.MedicalPersonnel:
    return get_medical_from_token(token, db)

# ─── Get Current Patient ──────────────────────────────────────────────────────
def get_current_patient(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> models.Patient:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "patient":
            raise HTTPException(status_code=403, detail="Access denied. Patients only.")
        user_id = payload.get("user_id")
        user = db.query(models.Patient).filter(models.Patient.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token.")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")