"""Private backend configuration; environment variables override local .env."""

import os
from pathlib import Path

from dotenv import dotenv_values


def get_setting(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    if value is None:
        value = dotenv_values(Path(__file__).with_name(".env")).get(name)
    return value if value is not None else default


def get_allowed_origins() -> list[str]:
    origins = [s.strip() for s in get_setting(
        "BREATHDX_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",") if s.strip()]
    if not origins or "*" in origins or any(
        not s.startswith(("http://", "https://")) for s in origins
    ):
        raise RuntimeError("BREATHDX_ALLOWED_ORIGINS must contain explicit HTTP(S) origins.")
    return origins


def get_jwt_secret(env_path: Path | None = None) -> str:
    """Require a configured signing key instead of a shared development key."""
    path = env_path if env_path is not None else Path(__file__).with_name(".env")
    secret = os.environ.get("BREATHDX_JWT_SECRET")
    if secret is None:
        secret = dotenv_values(path).get("BREATHDX_JWT_SECRET")
    if (
        not secret
        or len(secret.strip()) < 32
        or secret != secret.strip()
        or secret in {
            "breathdx-secret-key-change-in-production",
            "REPLACE_WITH_A_GENERATED_SECRET_AT_LEAST_32_CHARACTERS",
        }
    ):
        raise RuntimeError(
            "Set BREATHDX_JWT_SECRET to a generated secret of at least 32 characters "
            "in the environment or backend/.env. See backend/CONFIGURATION.md."
        )
    return secret
