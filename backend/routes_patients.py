import secrets
import string
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from auth import get_current_medical, get_current_patient, hash_password
import models, schemas
from routes_auth import save_account_change, AccountDatabaseErrorRoute

router = APIRouter(route_class=AccountDatabaseErrorRoute)

# ─── ADD PATIENT (Medical only) ───────────────────────────────────────────────
@router.post("/", response_model=schemas.PatientResponse)
def add_patient(
    data: schemas.PatientCreate,
    db: Session = Depends(get_db),
    current=Depends(get_current_medical)
):
    if db.query(models.Patient).filter(models.Patient.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered.")
    patient = models.Patient(
        full_name=data.full_name,
        email=data.email,
        hashed_password=hash_password(data.password),
        age=data.age,
        gender=data.gender,
        contact=data.contact,
        is_diabetic=data.is_diabetic,
        medical_personnel_id=current.id
    )
    db.add(patient)
    save_account_change(db)
    db.refresh(patient)
    return patient

# ─── GET ALL PATIENTS (Medical only) ─────────────────────────────────────────
@router.get("/", response_model=List[schemas.PatientResponse])
def get_patients(db: Session = Depends(get_db), current=Depends(get_current_medical)):
    return db.query(models.Patient).filter(
        models.Patient.medical_personnel_id == current.id
    ).all()

# ─── GET SINGLE PATIENT ───────────────────────────────────────────────────────
@router.get("/{patient_id}", response_model=schemas.PatientResponse)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current=Depends(get_current_medical)
):
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id,
        models.Patient.medical_personnel_id == current.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    return patient


@router.patch("/{patient_id}", response_model=schemas.PatientResponse)
def update_patient_details(patient_id: int, data: schemas.PatientDetailsUpdate,
                            db: Session = Depends(get_db), current=Depends(get_current_medical)):
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id,
        models.Patient.medical_personnel_id == current.id,
    ).first()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    for name, value in data.model_dump().items():
        setattr(patient, name, value)
    save_account_change(db)
    return patient

def _generate_temp_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


# ─── RESET PATIENT PASSWORD (Medical only) ─────────────────────────────────────
@router.post("/{patient_id}/reset-password", response_model=schemas.PatientCredentialsOnce)
def reset_patient_password(
    patient_id: int,
    data: schemas.PatientResetPassword = schemas.PatientResetPassword(),
    db: Session = Depends(get_db),
    current=Depends(get_current_medical),
):
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id,
        models.Patient.medical_personnel_id == current.id,
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    raw = data.new_password or ""
    new_password = raw if raw else _generate_temp_password()
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    patient.hashed_password = hash_password(new_password)
    save_account_change(db)

    return schemas.PatientCredentialsOnce(
        email=patient.email,
        temporary_password=new_password,
        message="Share these credentials securely with the patient. They will not be shown again.",
    )


# ─── DELETE PATIENT ───────────────────────────────────────────────────────────
@router.delete("/{patient_id}")
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current=Depends(get_current_medical)
):
    patient = db.query(models.Patient).filter(
        models.Patient.id == patient_id,
        models.Patient.medical_personnel_id == current.id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")
    if (db.query(models.Reading.id).filter(models.Reading.patient_id == patient.id).first()
            or db.query(models.ScanSession.id).filter(models.ScanSession.patient_id == patient.id).first()):
        raise HTTPException(
            status_code=409,
            detail="Patient has readings or scan history and cannot be deleted. Preserve their acquisition history.",
        )
    db.delete(patient)
    save_account_change(db)
    return {"message": f"Patient '{patient.full_name}' deleted successfully."}

# ─── GET OWN PROFILE (Patient only) ──────────────────────────────────────────
@router.get("/me/profile", response_model=schemas.PatientResponse)
def get_my_profile(current=Depends(get_current_patient)):
    return current
