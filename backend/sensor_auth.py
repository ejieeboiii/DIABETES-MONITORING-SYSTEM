"""Provider JWTs for manual entry; a private, provider-scoped key for devices."""

from dataclasses import dataclass
import secrets

from fastapi import Depends, Header, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from auth import get_medical_from_token
from database import get_db
import models
from settings import get_setting

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class SensorActor:
    medical_id: int
    is_device: bool = False
    device_id: str | None = None
    # Only constructed internally by the provider-authenticated simulator.
    is_simulated: bool = False


def configured_device_id() -> str:
    import re
    value = get_setting("BREATHDX_DEVICE_ID", "esp32-default").strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", value):
        raise HTTPException(status_code=503, detail="Device identity is incorrectly configured.")
    return value


def actor_device_id(actor: SensorActor) -> str:
    return actor.device_id or (configured_device_id() if actor.is_device else f"manual-provider-{actor.medical_id}")


def get_sensor_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    device_key: str | None = Header(default=None, alias="X-Device-Key"),
    db: Session = Depends(get_db),
) -> SensorActor:
    if device_key is not None:
        expected = get_setting("BREATHDX_DEVICE_KEY")
        provider_id = get_setting("BREATHDX_DEVICE_MEDICAL_ID")
        if (len(expected) < 32 or not provider_id.isdecimal()
                or not secrets.compare_digest(device_key.encode(), expected.encode())):
            raise HTTPException(status_code=401, detail="Invalid device credentials.")
        provider = db.get(models.MedicalPersonnel, int(provider_id))
        if provider is None:
            raise HTTPException(status_code=401, detail="Invalid device credentials.")
        return SensorActor(provider.id, is_device=True, device_id=configured_device_id())
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required.",
                            headers={"WWW-Authenticate": "Bearer"})
    return SensorActor(get_medical_from_token(credentials.credentials, db).id)
