"""Cross-role account/patient integration on private synthetic persistence."""
import unittest
from unittest.mock import patch
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from test_api_contracts import ApiContractFixture
import models


class AccountIntegrationTests(ApiContractFixture, unittest.TestCase):
    password = 'Software-Only-Password'

    def register(self):
        response=self.client.post('/auth/medical/register',json={
            'full_name':'Integration Provider','email':'integration@example.com',
            'password':self.password,'profession':'Test fixture'})
        self.assertEqual(response.status_code,200)
        data=response.json()
        return data,{'Authorization':'Bearer '+data['access_token']}

    def create_patient(self,headers):
        response=self.client.post('/patients/',headers=headers,json={
            'full_name':'Integration Patient','email':'integration-patient@example.com',
            'password':self.password,'age':30,'gender':'Other','contact':'synthetic contact'})
        self.assertEqual(response.status_code,200)
        return response.json()

    def patient_login(self,password=None):
        response=self.client.post('/auth/patient/login',json={
            'email':'integration-patient@example.com','password':password or self.password})
        self.assertEqual(response.status_code,200)
        return {'Authorization':'Bearer '+response.json()['access_token']}

    def test_registration_login_profile_and_duplicate_registration(self):
        registered,headers=self.register()
        login=self.client.post('/auth/medical/login',json={'email':'integration@example.com','password':self.password})
        self.assertEqual(login.status_code,200)
        self.assertEqual(login.json()['user']['id'],registered['user']['id'])
        self.assertEqual(self.client.get('/auth/medical/me',headers=headers).json()['id'],registered['user']['id'])
        updated=self.client.patch('/auth/medical/me',headers=headers,json={'full_name':'Edited Provider','profession':'Updated fixture'})
        self.assertEqual(updated.status_code,200)
        self.assertEqual(self.client.get('/auth/medical/me',headers=headers).json()['full_name'],'Edited Provider')
        self.assertEqual(self.client.post('/auth/medical/register',json={
            'full_name':'Duplicate','email':'integration@example.com','password':self.password}).status_code,400)
        self.assertEqual(self.client.post('/auth/medical/login',json={'email':'integration@example.com','password':'Wrong-Password'}).status_code,401)

    def test_patient_creation_edit_and_patient_profile_are_consistent(self):
        _,headers=self.register(); patient=self.create_patient(headers)
        patient_headers=self.patient_login()
        updated=self.client.patch(f'/patients/{patient["id"]}',headers=headers,json={
            'full_name':'Edited Patient','contact':'updated synthetic contact','age':31,'gender':'Other','is_diabetic':'Unknown'})
        self.assertEqual(updated.status_code,200)
        for path in ('/auth/patient/me','/patients/me/profile'):
            self.assertEqual(self.client.get(path,headers=patient_headers).json(),updated.json())
        own=self.client.patch('/auth/patient/me',headers=patient_headers,json={'full_name':'Self Edited','contact':'self fixture'})
        self.assertEqual(own.status_code,200)
        self.assertEqual(self.client.get(f'/patients/{patient["id"]}',headers=headers).json(),own.json())
        self.assertEqual(self.client.get('/readings/my',headers=patient_headers).json(),[])
        self.assertEqual(self.client.get('/readings/my/latest',headers=patient_headers).status_code,404)

    def test_provider_and_patient_object_ownership_for_all_patient_operations(self):
        _,headers=self.register(); patient=self.create_patient(headers)
        other=self.headers(provider=1)
        for method,path,body in (
            ('get',f'/patients/{patient["id"]}',None),
            ('patch',f'/patients/{patient["id"]}',{'full_name':'Forged','age':30,'gender':'Other'}),
            ('delete',f'/patients/{patient["id"]}',None),
            ('post',f'/patients/{patient["id"]}/reset-password',{}),
            ('get',f'/readings/patient/{patient["id"]}',None),
            ('get',f'/readings/patient/{patient["id"]}/latest',None),
            ('post','/readings/scans',{'patient_id':patient['id']}),
        ):
            kwargs={'headers':other}
            if body is not None: kwargs['json']=body
            self.assertEqual(getattr(self.client,method)(path,**kwargs).status_code,404)
        patient_headers=self.patient_login()
        for path in ('/patients/','/auth/medical/me','/readings/all','/readings/patient/1'):
            self.assertEqual(self.client.get(path,headers=patient_headers).status_code,403)
        self.assertNotIn(patient['id'],[item['id'] for item in self.client.get('/patients/',headers=other).json()])

    def test_provider_password_change_invalidates_old_sessions_and_login(self):
        _,headers=self.register()
        response=self.client.post('/auth/medical/change-password',headers=headers,json={
            'current_password':self.password,'new_password':'Updated-Software-Password'})
        self.assertEqual(response.status_code,200)
        self.assertEqual(self.client.get('/auth/medical/me',headers=headers).status_code,401)
        self.assertEqual(self.client.post('/auth/medical/login',json={'email':'integration@example.com','password':self.password}).status_code,401)
        self.assertEqual(self.client.post('/auth/medical/login',json={'email':'integration@example.com','password':'Updated-Software-Password'}).status_code,200)

    def test_patient_password_change_and_provider_reset_preserve_identity(self):
        _,headers=self.register(); patient=self.create_patient(headers)
        old=self.patient_login()
        self.assertEqual(self.client.post('/auth/patient/change-password',headers=old,json={
            'current_password':self.password,'new_password':'Updated-Software-Password'}).status_code,200)
        self.assertEqual(self.client.get('/readings/my',headers=old).status_code,401)
        current=self.patient_login('Updated-Software-Password')
        reset=self.client.post(f'/patients/{patient["id"]}/reset-password',headers=headers,json={'new_password':'Reset-Software-Password'})
        self.assertEqual(reset.status_code,200)
        self.assertEqual(self.client.get('/auth/patient/me',headers=current).status_code,401)
        final=self.patient_login('Reset-Software-Password')
        self.assertEqual(self.client.get('/auth/patient/me',headers=final).json()['id'],patient['id'])

    def test_invalid_creation_values_do_not_create_accounts(self):
        payload={'full_name':'Synthetic','email':'invalid@example.com','password':self.password,'age':30,'gender':'Other'}
        for values in ({'full_name':'   '},{'age':-1},{'age':131},{'age':True},{'gender':''}):
            self.assertEqual(self.client.post('/patients/',headers=self.headers(),json={**payload,**values}).status_code,422)
        self.assertEqual(self.client.post('/auth/medical/register',json={
            'full_name':'   ','email':'invalid-provider@example.com','password':self.password}).status_code,422)
        with self.sessions() as db:
            self.assertEqual(db.query(models.Patient).count(),2)
            self.assertEqual(db.query(models.MedicalPersonnel).count(),2)

    def test_history_free_patient_deletion_and_existing_history_protection(self):
        _,headers=self.register(); patient=self.create_patient(headers)
        self.assertEqual(self.client.delete(f'/patients/{patient["id"]}',headers=headers).status_code,200)
        self.assertEqual(self.client.get(f'/patients/{patient["id"]}',headers=headers).status_code,404)
        self.assertEqual(self.client.delete('/patients/1',headers=self.headers()).status_code,409)
        self.assertEqual(self.remaining_ids(),[1,2])

    def test_storage_failure_is_503_without_sensitive_details(self):
        headers=self.headers()
        with patch.object(Session,'query',side_effect=SQLAlchemyError('Synthetic private diagnostic')):
            for path in ('/patients/','/auth/medical/login'):
                response=self.client.get(path,headers=headers) if path=='/patients/' else self.client.post(path,json={'email':'x@example.com','password':self.password})
                self.assertEqual(response.status_code,503)
                self.assertNotIn('private diagnostic',response.text)
