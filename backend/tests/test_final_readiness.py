"""Final security/consistency regressions using private synthetic persistence."""
from pathlib import Path
import sqlite3
import tempfile
import unittest
from contextlib import closing

from auth import create_access_token
from auth_limits import AuthAttemptLimiter
from restore_database import restore_database
from backup_database import backup_database
from test_api_contracts import ApiContractFixture


class FinalApiTests(ApiContractFixture, unittest.TestCase):
    def test_invalid_password_unicode_is_validation_error(self):
        import json
        payload=json.dumps({'current_password':'Synthetic-Password','new_password':'\ud800'*8})
        response=self.client.post('/auth/medical/change-password',headers={
            **self.headers(),'Content-Type':'application/json'},content=payload)
        self.assertEqual(response.status_code,422)

    def test_websocket_does_not_broadcast_after_credential_invalidation(self):
        from auth import hash_password
        import models
        from starlette.websockets import WebSocketDisconnect
        token=self.headers()['Authorization'].split(' ',1)[1]
        with self.client.websocket_connect('/readings/ws/medical') as ws:
            ws.send_json({'type':'authenticate','token':token})
            self.assertEqual(ws.receive_json()['type'],'connected')
            with self.sessions() as db:
                db.get(models.MedicalPersonnel,1).hashed_password=hash_password('New-Synthetic-Password')
                db.commit()
            self.assertEqual(self.client.post('/readings/sensor',headers=self.headers(),json={
                'patient_id':1,'tgs822_raw_adc':1200,'tgs2620_raw_adc':1500,
                'temperature':25.0,'humidity':50.0}).status_code,200)
            with self.assertRaises(WebSocketDisconnect) as denied:ws.receive_json()
            self.assertEqual(denied.exception.code,1008)

    def test_malformed_signed_claims_are_rejected_without_server_error(self):
        for role, path in [('medical','/auth/medical/me'),('patient','/auth/patient/me')]:
            for claims in ({'user_id':True,'credential_version':'0'*64},
                           {'user_id':'1','credential_version':'0'*64},
                           {'user_id':1,'credential_version':'é'*64},
                           {'user_id':1,'credential_version':['invalid']}):
                token=create_access_token({'role':role,**claims})
                self.assertEqual(self.client.get(path,headers={'Authorization':'Bearer '+token}).status_code,401)

    def test_patient_edit_rejects_boolean_string_and_fractional_ages(self):
        for age in (True,'30',30.5):
            response=self.client.patch('/patients/1',headers=self.headers(),json={
                'full_name':'Synthetic patient','gender':'Other','age':age})
            self.assertEqual(response.status_code,422)

    def test_password_reset_preserves_exact_text_and_invalidates_prior_token(self):
        old=self.headers(1,'patient')
        password='  Synthetic-Password  '
        result=self.client.post('/patients/1/reset-password',headers=self.headers(),json={'new_password':password})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json()['temporary_password'],password)
        # Fixture's original password hash is deliberately synthetic; reset creates real bcrypt.
        email=result.json()['email']
        self.assertEqual(self.client.post('/auth/patient/login',json={'email':email,'password':password}).status_code,200)
        self.assertEqual(self.client.post('/auth/patient/login',json={'email':email,'password':password.strip()}).status_code,401)
        self.assertEqual(self.client.get('/auth/patient/me',headers=old).status_code,401)

    def test_auth_rate_limit_returns_retry_after_and_preserves_protected_routes(self):
        self.client.app.state.auth_limiter=AuthAttemptLimiter(limit=2)
        for _ in range(2):
            self.assertEqual(self.client.post('/auth/medical/login',json={
                'email':'invalid@example.com','password':'Synthetic-Password'}).status_code,401)
        denied=self.client.post('/auth/medical/login',json={'email':'invalid@example.com','password':'Synthetic-Password'})
        self.assertEqual(denied.status_code,429)
        self.assertGreater(int(denied.headers['retry-after']),0)
        self.assertEqual(self.client.get('/auth/medical/me',headers=self.headers()).status_code,200)


class FinalUtilityTests(unittest.TestCase):
    def test_unknown_account_still_performs_password_verification(self):
        from auth import authenticate_password
        from unittest.mock import patch
        with patch('auth.dummy_password_hash',return_value='synthetic-hash'), patch('auth.verify_password',return_value=True) as verify:
            self.assertFalse(authenticate_password('Synthetic-Password',None))
            verify.assert_called_once_with('Synthetic-Password','synthetic-hash')

    def test_runtime_sqlite_connections_enforce_foreign_keys(self):
        from database import enforce_foreign_keys
        with closing(sqlite3.connect(':memory:')) as db:
            enforce_foreign_keys(db,None)
            self.assertEqual(db.execute('PRAGMA foreign_keys').fetchone()[0],1)
            db.execute('CREATE TABLE parent(id INTEGER PRIMARY KEY)')
            db.execute('CREATE TABLE child(id INTEGER REFERENCES parent(id))')
            with self.assertRaises(sqlite3.IntegrityError):db.execute('INSERT INTO child VALUES(99)')

    def test_limiter_window_keys_and_bounded_memory(self):
        limiter=AuthAttemptLimiter(limit=1,window=10,capacity=2)
        limiter.check(('a','login'),now=0)
        from fastapi import HTTPException
        with self.assertRaises(HTTPException): limiter.check(('a','login'),now=1)
        limiter.check(('a','login'),now=10)
        limiter.check(('a','register'),now=10)
        limiter.check(('b','login'),now=10)
        self.assertEqual(len(limiter.entries),2)

    def test_backup_restore_preserves_rows_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            root=Path(folder); source=root/'source.db'; backup=root/'backup.db'; restored=root/'restored.db'
            with closing(sqlite3.connect(source)) as db:
                db.execute('CREATE TABLE patients(id INTEGER PRIMARY KEY)')
                db.execute('CREATE TABLE readings(id INTEGER PRIMARY KEY,patient_id INTEGER REFERENCES patients(id),legacy_adc INTEGER,tgs822 INTEGER)')
                db.execute('INSERT INTO patients VALUES(1)')
                db.execute('INSERT INTO readings VALUES(1,1,1200,NULL)');db.commit()
            backup_database(source,backup);restore_database(backup,restored)
            with closing(sqlite3.connect(restored)) as db:
                self.assertEqual(db.execute('SELECT * FROM readings').fetchall(),[(1,1,1200,None)])
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            with self.assertRaises(FileExistsError):restore_database(backup,restored)

    def test_restore_rejects_corrupt_empty_and_broken_foreign_key_sources(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as folder:
            root=Path(folder); bad=root/'bad.db'; output=root/'output.db'
            bad.write_bytes(b'not a database')
            with self.assertRaises(sqlite3.DatabaseError):restore_database(bad,output)
            self.assertFalse(output.exists())
            empty=root/'empty.db';empty.touch()
            with self.assertRaises(ValueError):restore_database(empty,output)
            with closing(sqlite3.connect(root/'broken.db')) as db:
                db.execute('CREATE TABLE parent(id INTEGER PRIMARY KEY)')
                db.execute('CREATE TABLE child(id INTEGER REFERENCES parent(id))')
                db.execute('INSERT INTO child VALUES(99)');db.commit()
            with self.assertRaises(ValueError):restore_database(root/'broken.db',output)
            self.assertFalse(output.exists())
