"""Run existing integration scripts in a fresh loopback-only disposable fixture.

Never starts, resets or targets the working API/database. Requires ui_fixture:app
already running on port 8012 with no readings/receipts; restart that disposable
fixture deliberately before this suite. No credentials/payloads are printed.
"""
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4
import httpx


def run(command, directory, label):
    result = subprocess.run(command, cwd=directory, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{label} failed (exit {result.returncode}); inspect its isolated test setup.')
    print(f'PASS: {label}')


def main():
    backend = Path(__file__).resolve().parents[1]
    web = backend.parent / 'frontend-web'
    with httpx.Client(base_url='http://127.0.0.1:8012', timeout=15) as client:
        summary=client.get('/__test/simulation-summary');summary.raise_for_status()
        if summary.json()['saved_readings'] or summary.json()['acquisitions']:
            raise RuntimeError('Requires a fresh disposable fixture; no data was reset.')
        run([sys.executable,'-B','tests/check_step4_integration.py'],backend,'preprocessing/scan HTTP integration')
        run(['node','tests/mobile-api.integration.mjs'],web,'original mobile API/database integration')
        run(['node','tests/step7-mobile.integration.mjs'],web,'final mobile provenance integration')
        run(['node','tests/step5-api.integration.mjs'],web,'web/mobile account, ownership and recovery integration')
        login=client.post('/auth/medical/login',json={'email':'demo@example.com','password':'Test-Only-Password'});login.raise_for_status()
        headers={'Authorization':'Bearer '+login.json()['access_token']}
        patient=client.post('/patients/',headers=headers,json={'full_name':'Browser Test Patient',
            'email':'browser-patient@example.com','password':'Test-Only-Password','age':32,'gender':'Other'})
        patient.raise_for_status();patient_id=patient.json()['id']
        edited=client.patch(f'/patients/{patient_id}',headers=headers,json={
            'full_name':'Edited Browser Patient','age':32,'gender':'Other'});edited.raise_for_status()
        session=uuid4().hex
        response=client.post('/readings/simulations',headers=headers,json={
            'patient_id':patient_id,'session_id':session,'stage_seconds':0.5});response.raise_for_status()
        for _ in range(30):
            response=client.post(f'/readings/simulations/{session}/advance',headers=headers);response.raise_for_status()
            if response.json()['stage']=='completed':break
            time.sleep(0.55)
        else:raise RuntimeError('Disposable history setup did not complete.')
        run(['node','tests/step5-history.integration.mjs'],web,'multi-page history and patient/mobile synchronization')
        print('PASS: complete available integration suite; only disposable synthetic data used.')


if __name__=='__main__':
    try:main()
    except Exception as exc:
        print(f'FAIL: {type(exc).__name__}; fixture/integration check failed.',file=sys.stderr)
        sys.exit(1)
