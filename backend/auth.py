from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import secrets
from functools import lru_cache
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from database import get_db
import models
from settings import get_jwt_secret

SECRET_KEY = get_jwt_secret()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def get_bearer_token(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required.",
                            headers={"WWW-Authenticate": "Bearer"})
    return credentials.credentials

# ─── Password ─────────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    try:
        byte_length = len(password.encode("utf-8"))
    except UnicodeError:
        raise HTTPException(status_code=422, detail="Password must be valid UTF-8 text.") from None
    if len(password) < 8 or byte_length > 72:
        raise HTTPException(status_code=422, detail="Password must have at least 8 characters and at most 72 UTF-8 bytes.")
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    try:
        if len(plain.encode("utf-8")) > 72:
            return False
        return pwd_context.verify(plain, hashed)
    except (UnicodeError, ValueError):
        return False


@lru_cache(maxsize=1)
def dummy_password_hash() -> str:
    """Transient hash prevents unknown-email login from skipping bcrypt work."""
    return hash_password(secrets.token_urlsafe(24))


def authenticate_password(password: str, user) -> bool:
    valid = verify_password(password, user.hashed_password if user else dummy_password_hash())
    return user is not None and valid

# ─── Token ────────────────────────────────────────────────────────────────────
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode.update({"exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def credential_version(hashed_password: str) -> str:
    """Opaque claim changes when the password changes, without a DB migration."""
    return hmac.new(SECRET_KEY.encode(), hashed_password.encode(), hashlib.sha256).hexdigest()


def create_user_token(user, role: str) -> str:
    return create_access_token({"user_id": user.id, "role": role,
                                "credential_version": credential_version(user.hashed_password)})


def verify_credential_version(payload: dict, user) -> None:
    version = payload.get("credential_version", "")
    if (not isinstance(version, str) or len(version) != 64
            or any(c not in "0123456789abcdef" for c in version)
            or not hmac.compare_digest(version, credential_version(user.hashed_password))):
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")


def get_medical_from_token(token: str, db: Session) -> models.MedicalPersonnel:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "medical":
            raise HTTPException(status_code=403, detail="Access denied. Medical personnel only.")
        user_id = payload.get("user_id")
        if type(user_id) is not int or user_id <= 0:
            raise HTTPException(status_code=401, detail="Invalid token.")
        user = db.query(models.MedicalPersonnel).filter(models.MedicalPersonnel.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token.")
        verify_credential_version(payload, user)
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

# ─── Get Current Medical Personnel ───────────────────────────────────────────
def get_current_medical(
    token: str = Depends(get_bearer_token),
    db: Session = Depends(get_db)
) -> models.MedicalPersonnel:
    return get_medical_from_token(token, db)

# ─── Get Current Patient ──────────────────────────────────────────────────────
def get_current_patient(
    token: str = Depends(get_bearer_token),
    db: Session = Depends(get_db)
) -> models.Patient:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "patient":
            raise HTTPException(status_code=403, detail="Access denied. Patients only.")
        user_id = payload.get("user_id")
        if type(user_id) is not int or user_id <= 0:
            raise HTTPException(status_code=401, detail="Invalid token.")
        user = db.query(models.Patient).filter(models.Patient.id == user_id).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token.")
        verify_credential_version(payload, user)
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
