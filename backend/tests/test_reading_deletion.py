"""Reading deletion authorization tests using only an in-memory database.

Run from backend: venv/Scripts/python.exe -m unittest discover -s tests -v
"""

import unittest
import secrets
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool, QueuePool

import models
with patch.dict("os.environ", {"BREATHDX_JWT_SECRET": secrets.token_urlsafe(48)}):
    from auth import create_user_token, get_medical_from_token
from database import Base

from routes_readings import delete_reading


class ReadingFixture:
    def setUp(self):
        url = getattr(self, "test_database_url", "sqlite://")
        self.engine = create_engine(url, connect_args={"check_same_thread": False},
                                    poolclass=StaticPool if url == "sqlite://" else QueuePool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(bind=self.engine)
        with self.sessions() as db:
            db.add_all([
                models.MedicalPersonnel(id=i, full_name=f"Provider {i}",
                                        email=f"provider{i}@example.com",
                                        hashed_password="unused")
                for i in (1, 2)
            ])
            db.flush()
            db.add_all([
                models.Patient(id=i, full_name=f"Patient {i}",
                               email=f"patient{i}@example.com", age=30,
                               gender="Other", hashed_password="unused",
                               medical_personnel_id=i)
                for i in (1, 2)
            ])
            db.flush()
            db.add_all([
                models.Reading(id=i, patient_id=i, acetone_ppm=1.0,
                               temperature=25, humidity=50,
                               diabetes_level=models.DiabetesLevel.NORMAL)
                for i in (1, 2)
            ])
            db.commit()

    def tearDown(self):
        self.engine.dispose()

    def delete(self, reading_id, role="medical", user_id=1):
        with self.sessions() as db:
            model = models.Patient if role == "patient" else models.MedicalPersonnel
            token = create_user_token(db.get(model, user_id), role)
            current = get_medical_from_token(token, db)
            return delete_reading(reading_id, db=db, current=current)

    def remaining_ids(self):
        with self.sessions() as db:
            return [row.id for row in db.query(models.Reading).order_by(models.Reading.id)]

class ReadingDeletionTests(ReadingFixture, unittest.TestCase):
    def test_owner_can_delete(self):
        response = self.delete(1)
        self.assertEqual(response, {"message": "Reading deleted successfully."})
        self.assertEqual(self.remaining_ids(), [2])

    def test_other_provider_cannot_delete(self):
        with self.assertRaises(HTTPException) as raised:
            self.delete(2)
        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail, "Reading not found.")
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_missing_reading(self):
        with self.assertRaises(HTTPException) as raised:
            self.delete(999)
        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_patient_cannot_delete(self):
        with self.assertRaises(HTTPException) as raised:
            self.delete(1, role="patient")
        self.assertEqual(raised.exception.status_code, 403)
        self.assertEqual(self.remaining_ids(), [1, 2])

    def test_invalid_token_cannot_authenticate(self):
        with self.sessions() as db:
            with self.assertRaises(HTTPException) as raised:
                get_medical_from_token("invalid-token", db)
        self.assertEqual(raised.exception.status_code, 401)
        self.assertEqual(self.remaining_ids(), [1, 2])


if __name__ == "__main__":
    unittest.main()
