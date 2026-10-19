# JWT signing key

Authentication requires `BREATHDX_JWT_SECRET`. Supply it through your deployment's
secret manager or environment, or use `backend/.env` for local development.
The process environment takes precedence. The local file is resolved relative
to `settings.py`, regardless of the current working directory.

For a new local checkout, run from `backend` in PowerShell:

```powershell
.\venv\Scripts\python.exe -B -c "from pathlib import Path; import secrets; p = Path('.env'); f = p.open('x', encoding='utf-8'); f.write('BREATHDX_JWT_SECRET=' + secrets.token_urlsafe(48) + '\n'); f.close()"
```

This creates the file only if it does not already exist. If you already have an
`.env`, add a freshly generated key without overwriting its other settings.
Use at least 32 characters from a cryptographically secure generator. Missing,
blank, short, surrounding-whitespace, and known placeholder keys prevent startup.
The application never generates a replacement on startup, so keys remain stable
across restarts and workers.

Keep `.env` private and out of version control, logs, screenshots, and client
configuration. Never use an `EXPO_PUBLIC_` or `VITE_` variable for this secret.
The example file contains only a placeholder and cannot be used as a signing key.

Restart the backend after changing the key. Tokens signed with the previous key
will be rejected; web and mobile users must log in again. JWT algorithm, roles,
API response shapes, and the 24-hour token lifetime are unchanged.

## Reading ingestion and listener

Manual `POST /readings/sensor` requires a medical Bearer token and an owned
patient ID. Patient tokens and anonymous requests cannot submit readings.

Device uploads and `GET /readings/listener/armed-patient` support `X-Device-Key`.
Set a separate generated key of at least 32 characters as `BREATHDX_DEVICE_KEY`
and set `BREATHDX_DEVICE_MEDICAL_ID` to the owning provider's existing account ID.
Never use the JWT signing key as a device key. Keep both in backend `.env` or
managed server secrets. Copy `device_secrets.h.example` to the ignored
`iot-prototype/esp32/esp32_breathdx/device_secrets.h` and provision the same device
key there privately. A device key grants ingestion for that provider only; it
does not grant patient history, account management, or reading deletion.

Sensor payloads require numeric JSON values: integer ADC/patient/baseline fields
and finite numeric temperature/humidity. Booleans and numeric strings are rejected.
ADC zero/saturation, invalid environments and weak supplied-baseline signals are
not saved. The updated sketch skips invalid DHT/ADC measurements rather than
uploading guessed environment defaults. Firmware warmup is configurable and defaults
to disabled; no validated physical warmup duration is supplied. The final firmware
acquires paired baselines, detects configurable ADC changes and sends separate
TGS822/TGS2620 capture bursts with real DHT22 measurements. See the Step 6 report.

Providers start/stop their listener using their JWT. Sessions expire after 15
minutes and are isolated by provider. Devices poll the selected patient and must
send that exact ID with the upload; stopped, expired, or changed selections
return 409. Stop requests can include the `session_id` returned when arming, so
an old tab's cleanup cannot cancel a newer session. Explicit provider stops
without a session ID cancel that provider's current listener.

Scan sessions, simulation runs and acquisition receipts are persistent in SQLite.
Server restarts preserve session state and expiry; authenticated status checks
resolve current state. Cancelled, expired and replaced sessions reject new readings.
Acquisition IDs and payload fingerprints prevent duplicate records, including
ambiguous requests. Firmware journals exact payloads/IDs and checks receipts before
replaying the same acquisition after interruption/restart. Deleted receipts remain
tombstones and cannot recreate deleted readings. One logical acquisition may require
multiple HTTP requests. Never retry with a fresh ID for the same scan.

WebSocket connections/broadcasts remain process-local. Use one API worker for
reliable prototype notifications; durable REST scan/history polling remains available.
Reference firmware builds passed; physical board upload and sensor behavior are
unverified. Do not interpret compilation or synthetic data as physical calibration.

## Authentication throttling

Registration and each role-specific login endpoint allow up to 30 attempts per
client IP/endpoint in a five-minute window per API process. Further requests return
429 with Retry-After. No passwords or account identifiers enter limiter storage.
Only the server-resolved client address is used; caller-supplied forwarding headers
are not independently trusted. Configure trusted reverse proxies explicitly.
This bounded local limiter resets on restart and is not distributed attack
protection; production needs shared gateway limits, managed secrets and HTTPS.

## Backup and restore

Stop the API before a maintenance restore/schema switch. Never test restoration by
overwriting the working patient database. Use a new destination and validate it:

```powershell
.\venv\Scripts\python.exe -B backup_database.py --source PATH_TO_SOURCE.db --output NEW_BACKUP.db
.\venv\Scripts\python.exe -B restore_database.py --source NEW_BACKUP.db --output NEW_RESTORED.db
```

Replace placeholders with deliberate private paths. Both commands refuse an
existing output. Restore checks integrity, foreign-key references and nonempty
application tables before copying. It does not switch the running database.
Compare schema/history and preserve a fresh backup before any manual switch while
the API is stopped. Keep backups private; use disposable databases for rehearsal.
Migration tests verify preservation and rollback; create_all is not a migration.

## WebSocket authentication

Connect to `/readings/ws/medical` without credentials or patient IDs in the URL.
The optional patient_id filters owned readings; omit it for all owned patients.
Within ten seconds, send `{"type":"authenticate","token":"<medical token>","patient_id":1}`
as the first frame. The server validates role and patient ownership, then sends
the existing `connected` event. `reading_created` and ping/pong events retain their
existing names. Old clients sending only a token query parameter must be updated.
The active web client and the mobile WebSocket helper/consumer use this handshake.
Credentials are rechecked before each reading broadcast and on incoming frames/
idle timeout, so changed passwords and expired tokens cannot receive fresh reading
events while waiting for the next client ping.
Use HTTPS/WSS for deployments. The start script disables access logs; ensure
proxy logging does not record authentication frames or headers either.

## Experimental estimates

Estimates are disabled by default and appear as unavailable, never zero.
After reviewing a model's provenance and evaluation, explicitly set:

- `BREATHDX_GLUCOSE_MODEL=linear_three` for the joblib bundle produced by
  `ml/train_glucose_model.py`, or `linear_single` for a trusted single-feature pickle.
- `BREATHDX_GLUCOSE_MODEL_PATH` to the artifact (relative to backend or absolute).
- `BREATHDX_GLUCOSE_MODEL_SHA256` to the reviewed artifact's SHA-256 digest.

Hash pinning checks file integrity; it does not make an untrusted pickle/joblib
safe. Deserialization can execute code, so enable only trusted artifacts. There
is no automatic training, no fabricated dataset, and no model artifact was loaded
or evaluated during these fixes. The six-gas Random Forest is not connected.
Three-feature bundles must contain exactly acetone_ppm, temperature and humidity;
inference follows their stored feature order. Missing, corrupt, mismatched or
invalid-output models leave `predicted_bgl` null while preserving a valid reading.
PPM, Celsius, humidity percent, and experimental glucose mg/dL remain distinct.

## Accounts and persistence

Swagger uses HTTP Bearer authorization: log in through the role-specific JSON
endpoint, then paste the token into Authorize. There is no fake OAuth login URL.

Provider/patient profile edits and password changes are available in My account.
Providers can edit owned patient details. Login email and ownership are not editable
through these profile endpoints. New passwords require eight characters and at
most 72 UTF-8 bytes (bcrypt's limit). Password changes/resets invalidate previous
JWTs without adding a database column. Existing tokens without the credential
version claim also require a fresh login after this update.

Patients with readings cannot be deleted (409); delete individual readings
deliberately first if authorized to permanently remove their history. No rows were
deleted, and no schema migration was applied. Existing naive timestamps remain
stored as UTC; API timestamps now include an explicit UTC offset.

For a private, non-overwriting backup, from backend:

```powershell
New-Item -ItemType Directory -Path backups -Force
.\venv\Scripts\python.exe -B backup_database.py --output backups\before-change.db
```

The SQLite backup API makes a consistent snapshot and checks integrity. Choose a
new output filename each time. Backups contain private health data and stay ignored
by Git. Before any future schema migration: create and verify a restorable backup,
test the migration and reversal on a copy, stop writes during the approved change,
and compare schema/row counts and relationships afterward. To restore, stop the
backend and replace its database with the verified backup privately; do not restore
over an active server. Retention periods require a project policy; no automatic
purge or historical-data migration is performed here.

## Deployment and verification

Web requests use the current origin unless `VITE_API_URL` specifies a separate
API before building. Use HTTPS for a separate production API and list the exact
web origin in `BREATHDX_ALLOWED_ORIGINS`. Development proxies use port 8001 unless
`BREATHDX_BACKEND_URL` overrides it. Mobile Metro uses 8081; the backend uses 8001.
Physical devices need a reachable backend via `EXPO_PUBLIC_API_URL`; a Metro tunnel
does not tunnel the API. Keep signing/device/model configuration out of all public
client variables. The current client token storage remains localStorage/AsyncStorage;
encrypted device storage and an HttpOnly cookie/session design need separate work.

From backend, run `venv/Scripts/python.exe -B -m unittest discover -s tests -v`.
From frontend-web, run `node --test tests/monitoring.test.mjs`, `npm run lint`, and
`npm run build`. Tests use synthetic isolated persistence, mock model artifacts,
and a private test app; they do not import main.py or use the patient database.

The optional `tests/ui_fixture.py` is a disposable in-memory UI fixture, bound to
loopback port 8012. It must never be used as a production backend. Actual hardware,
physical mobile devices, clinical calibration and real-model accuracy require
independent verification. Durable audit history, self-service provider recovery,
retention policy enforcement and a migration framework remain future features;
they need storage/workflow decisions rather than silent schema or service additions.
## TGS822 / TGS2620 sensor upgrade

Step 2 adds durable scan sessions and acquisition IDs. Existing installations
also require `migrate_scan_workflow.py`; see [SCAN_WORKFLOW.md](SCAN_WORKFLOW.md)
for device identity, completion/recovery and the hardware-free integration checks.

The active sensor contract now stores independent TGS822/TGS2620 raw ADC values
with DHT22 measurements. Physical calibration remains unverified. Existing
databases require the backed-up sensor migration before startup; historical
MQ-138 readings are retained. See [SENSOR_CONFIGURATION.md](SENSOR_CONFIGURATION.md)
for payloads, migration/restore procedure and firmware configuration.
