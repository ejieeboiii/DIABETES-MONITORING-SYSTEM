"""Isolated secret configuration and JWT rotation regression tests."""

import os
import secrets
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from jose import JWTError, jwt

from settings import get_jwt_secret, get_allowed_origins


class JwtSettingsTests(unittest.TestCase):
    def setUp(self):
        self.test_root = Path(__file__).resolve().parent
        self.temp = tempfile.TemporaryDirectory(dir=self.test_root, prefix="jwt-test-")
        self.path = Path(self.temp.name) / ".env"
        self.key = secrets.token_urlsafe(48)
        self.env = patch.dict(os.environ, {}, clear=True)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        assert Path(self.temp.name).resolve().parent == self.test_root
        self.temp.cleanup()

    def test_missing_key_fails(self):
        with self.assertRaises(RuntimeError):
            get_jwt_secret(self.path)

    def test_invalid_keys_fail_without_disclosing_them(self):
        for value in ("", "short", " " * 40, " " + self.key,
                      "breathdx-secret-key-change-in-production",
                      "REPLACE_WITH_A_GENERATED_SECRET_AT_LEAST_32_CHARACTERS"):
            with self.subTest(value_length=len(value)):
                os.environ["BREATHDX_JWT_SECRET"] = value
                with self.assertRaises(RuntimeError) as raised:
                    get_jwt_secret(self.path)
                if value:
                    self.assertNotIn(value, str(raised.exception))

    def test_local_file_is_stable(self):
        self.path.write_text(f"BREATHDX_JWT_SECRET={self.key}\n", encoding="utf-8")
        self.assertEqual(get_jwt_secret(self.path), self.key)
        self.assertEqual(get_jwt_secret(self.path), self.key)

    def test_environment_overrides_file(self):
        self.path.write_text("BREATHDX_JWT_SECRET=short\n", encoding="utf-8")
        os.environ["BREATHDX_JWT_SECRET"] = self.key
        self.assertEqual(get_jwt_secret(self.path), self.key)

    def test_invalid_environment_does_not_fall_back(self):
        self.path.write_text(f"BREATHDX_JWT_SECRET={self.key}\n", encoding="utf-8")
        os.environ["BREATHDX_JWT_SECRET"] = ""
        with self.assertRaises(RuntimeError):
            get_jwt_secret(self.path)

    def test_cors_requires_explicit_origins(self):
        with patch("settings.get_setting", return_value="https://example.com,http://localhost:5173"):
            self.assertEqual(get_allowed_origins(), ["https://example.com", "http://localhost:5173"])
        for value in ["*", "", "file:///private"]:
            with patch("settings.get_setting", return_value=value), self.assertRaises(RuntimeError):
                get_allowed_origins()

    def test_auth_signing_uses_configured_key_and_rotation_rejects_old_tokens(self):
        os.environ["BREATHDX_JWT_SECRET"] = self.key
        import auth

        with patch.object(auth, "SECRET_KEY", get_jwt_secret(self.path)):
            for role in ("medical", "patient"):
                token = auth.create_access_token({"user_id": 1, "role": role})
                payload = jwt.decode(token, self.key, algorithms=["HS256"])
                self.assertEqual(payload["role"], role)
                self.assertEqual(payload["user_id"], 1)
                self.assertIn("exp", payload)
                with self.assertRaises(JWTError):
                    jwt.decode(token, secrets.token_urlsafe(48), algorithms=["HS256"])
            old_token = jwt.encode({"user_id": 1, "role": "medical"},
                                   "breathdx-secret-key-change-in-production",
                                   algorithm="HS256")
            with self.assertRaises(JWTError):
                jwt.decode(old_token, self.key, algorithms=["HS256"])


if __name__ == "__main__":
    unittest.main()
