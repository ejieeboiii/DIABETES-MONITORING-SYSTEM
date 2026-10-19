from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from auth import hash_password, verify_password, authenticate_password, create_user_token, get_current_medical, get_current_patient
from sqlalchemy.exc import SQLAlchemyError
from fastapi.routing import APIRoute
import models, schemas
from auth_limits import limit_auth_attempts

class AccountDatabaseErrorRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()
        async def guarded(request):
            try:
                return await handler(request)
            except SQLAlchemyError as exc:
                raise HTTPException(status_code=503, detail="Account storage temporarily unavailable. Please retry.") from exc
        return guarded


router = APIRouter(route_class=AccountDatabaseErrorRoute)

# ─── MEDICAL REGISTER ─────────────────────────────────────────────────────────
@router.post("/medical/register", response_model=schemas.MedicalTokenResponse, dependencies=[Depends(limit_auth_attempts)])
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
    save_account_change(db)
    db.refresh(user)
    token = create_user_token(user, "medical")
    return {"access_token": token, "token_type": "bearer", "role": "medical", "user": user}

# ─── MEDICAL LOGIN ────────────────────────────────────────────────────────────
@router.post("/medical/login", response_model=schemas.MedicalTokenResponse, dependencies=[Depends(limit_auth_attempts)])
def medical_login(data: schemas.MedicalLogin, db: Session = Depends(get_db)):
    user = db.query(models.MedicalPersonnel).filter(models.MedicalPersonnel.email == data.email).first()
    if not authenticate_password(data.password, user):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_user_token(user, "medical")
    return {"access_token": token, "token_type": "bearer", "role": "medical", "user": user}

# ─── PATIENT LOGIN ────────────────────────────────────────────────────────────
@router.post("/patient/login", response_model=schemas.PatientTokenResponse, dependencies=[Depends(limit_auth_attempts)])
def patient_login(data: schemas.PatientLogin, db: Session = Depends(get_db)):
    user = db.query(models.Patient).filter(models.Patient.email == data.email).first()
    if not authenticate_password(data.password, user):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_user_token(user, "patient")
    return {"access_token": token, "token_type": "bearer", "role": "patient", "user": user}

# ─── GET ME (Medical) ─────────────────────────────────────────────────────────
@router.get("/medical/me", response_model=schemas.MedicalResponse)
def get_me_medical(current=Depends(get_current_medical)):
    return current

# ─── GET ME (Patient) ─────────────────────────────────────────────────────────
@router.get("/patient/me", response_model=schemas.PatientResponse)
def get_me_patient(current=Depends(get_current_patient)):
    return current


def save_account_change(db: Session) -> None:
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Account update could not be saved.") from exc


@router.patch("/medical/me", response_model=schemas.MedicalResponse)
def update_provider_profile(data: schemas.ProviderProfileUpdate, db: Session = Depends(get_db),
                            current=Depends(get_current_medical)):
    current.full_name = data.full_name
    current.profession = data.profession
    save_account_change(db)
    return current


@router.patch("/patient/me", response_model=schemas.PatientResponse)
def update_patient_profile(data: schemas.PatientProfileUpdate, db: Session = Depends(get_db),
                           current=Depends(get_current_patient)):
    current.full_name = data.full_name
    current.contact = data.contact
    save_account_change(db)
    return current


def change_password(data: schemas.PasswordChange, db: Session, current) -> dict:
    if not verify_password(data.current_password, current.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="Choose a different new password.")
    current.hashed_password = hash_password(data.new_password)
    save_account_change(db)
    return {"message": "Password changed. Please log in again."}


@router.post("/medical/change-password")
def change_provider_password(data: schemas.PasswordChange, db: Session = Depends(get_db),
                             current=Depends(get_current_medical)):
    return change_password(data, db, current)


@router.post("/patient/change-password")
def change_patient_password(data: schemas.PasswordChange, db: Session = Depends(get_db),
                            current=Depends(get_current_patient)):
    return change_password(data, db, current)
