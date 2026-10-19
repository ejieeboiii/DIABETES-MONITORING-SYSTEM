"""Loopback disposable-fixture smoke check; never targets the real API/database."""
import time
from uuid import uuid4
import httpx


def main():
    with httpx.Client(base_url="http://127.0.0.1:8012",timeout=10) as client:
        # Require the test-only fixture marker before any mutation.
        before=client.get("/__test/simulation-summary"); before.raise_for_status()
        login=client.post("/auth/medical/login",json={"email":"demo@example.com","password":"Test-Only-Password"})
        login.raise_for_status()
        headers={"Authorization":"Bearer "+login.json()["access_token"]}
        session_id=uuid4().hex
        started=client.post("/readings/simulations",headers=headers,
                            json={"patient_id":1,"session_id":session_id,"stage_seconds":0.5})
        started.raise_for_status()
        outcome=started.json()
        deadline=time.monotonic()+30
        while outcome["stage"]!="completed" and time.monotonic()<deadline:
            advanced=client.post(f"/readings/simulations/{session_id}/advance",headers=headers)
            advanced.raise_for_status(); outcome=advanced.json()
            if outcome["stage"] in ("failed","cancelled","timed_out","replaced"):
                raise AssertionError("Unexpected terminal simulation state")
            time.sleep(0.55)
        assert outcome["stage"]=="completed"
        reading=outcome["reading"]
        assert reading["is_simulated"] is True and reading["preprocessing_version"]=="tgs-adc-v1"
        assert reading["estimation_status"]=="unavailable" and reading["estimation_reason"]=="simulated_data"
        assert reading["calibration_version"] is None and reading["model_version"] is None
        assert all(reading[field] is None for field in ("predicted_bgl","acetone_ppm","diabetes_level"))
        assert reading["preprocessing_metadata"]["features"]["tgs822_baseline_normalized"] is not None
        for _ in range(2):
            replay=client.post(f"/readings/simulations/{session_id}/advance",headers=headers)
            replay.raise_for_status(); assert replay.json()["reading"]==reading
        after=client.get("/__test/simulation-summary").json()
        assert after["saved_readings"]==before.json()["saved_readings"]+1
        assert after["saved_readings"]==after["acquisitions"]==after["unique_acquisitions"]
        patient=client.post("/auth/patient/login",json={"email":"patient@example.com","password":"Test-Only-Password"})
        patient.raise_for_status()
        retrieved=client.get("/readings/my/latest",headers={"Authorization":"Bearer "+patient.json()["access_token"]})
        retrieved.raise_for_status(); assert retrieved.json()==reading
        print("PASS: full simulation, persisted preprocessing, unavailable estimation, duplicate prevention and authenticated patient retrieval.")


if __name__=="__main__":
    main()
