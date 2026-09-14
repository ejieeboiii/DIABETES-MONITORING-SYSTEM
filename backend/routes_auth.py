from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import hash_password, verify_password, create_access_token, get_current_medical, get_current_patient
import models, schemas

router = APIRouter()

# ─── MEDICAL REGISTER ─────────────────────────────────────────────────────────
@router.post("/medical/register", response_model=schemas.MedicalTokenResponse)
def medical_register(data: schemas.MedicalRegister, db: Session = Depends(get_db)):
    if db.query(models.MedicalPersonnel).filter(models.MedicalPersonnel.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")
    user = models.MedicalPersonnel(
        full_name=data.full_name,
        email=data.email,
        hashed_password=hash_password(data.password),
        profession=data.profession
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"user_id": user.id, "role": "medical"})
    return {"access_token": token, "token_type": "bearer", "role": "medical", "user": user}

# ─── MEDICAL LOGIN ────────────────────────────────────────────────────────────
@router.post("/medical/login", response_model=schemas.MedicalTokenResponse)
def medical_login(data: schemas.MedicalLogin, db: Session = Depends(get_db)):
    user = db.query(models.MedicalPersonnel).filter(models.MedicalPersonnel.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token({"user_id": user.id, "role": "medical"})
    return {"access_token": token, "token_type": "bearer", "role": "medical", "user": user}

# ─── PATIENT LOGIN ────────────────────────────────────────────────────────────
@router.post("/patient/login", response_model=schemas.PatientTokenResponse)
def patient_login(data: schemas.PatientLogin, db: Session = Depends(get_db)):
    user = db.query(models.Patient).filter(models.Patient.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_access_token({"user_id": user.id, "role": "patient"})
    return {"access_token": token, "token_type": "bearer", "role": "patient", "user": user}

# ─── GET ME (Medical) ─────────────────────────────────────────────────────────
@router.get("/medical/me", response_model=schemas.MedicalResponse)
def get_me_medical(current=Depends(get_current_medical)):
    return current

# ─── GET ME (Patient) ─────────────────────────────────────────────────────────
@router.get("/patient/me", response_model=schemas.PatientResponse)
def get_me_patient(current=Depends(get_current_patient)):
    return current