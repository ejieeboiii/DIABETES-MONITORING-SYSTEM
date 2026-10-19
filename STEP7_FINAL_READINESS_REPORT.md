# Step 7 — Final software-readiness audit

Audit date: 2026-10-14. Physical testing and Step 8 were not started.

## Outcome and scope

BreathDX's existing capstone software is ready for controlled software demonstrations and preparation for physical IoT bench integration. The final sensor contract is ESP32 + TGS822 + TGS2620 + DHT22. The provider-to-patient simulated workflow, persistent scan APIs, database storage, preprocessing, model safeguards and reference firmware builds have software evidence. This is **not production certification, hardware verification or medical validation**.

The audit resumed existing Step 7 changes instead of replacing Steps 1–6. Previous reports, active routes/screens, API clients, authentication, persistence/migrations, processing/model gates and firmware were inspected. Historical skill/root-guide descriptions sometimes lag source; current implementation and Expo SDK 57 were used. No dependencies/frameworks were upgraded, no patient accounts/readings were added to the working database, no model was trained, no UI redesign was performed and no device was flashed.

## Issues found and fixed

| Issue | Resolution and evidence |
| --- | --- |
| Reset passwords were trimmed by both web and backend | Both preserve exactly submitted text. Empty/absent input retains generated-password behavior. Regression verifies whitespace-preserving login, trimmed-password rejection and old-token invalidation. Browser password entry was not automated |
| Patient editing accepted coerced ages unlike creation | Editing now requires a strict integer from 0 through 130. Boolean, string and fractional-age regression cases return 422 |
| Malformed signed JWT claims could reach unsafe comparison/query paths | Positive integer user IDs and 64-character lowercase hexadecimal credential versions are required. Non-ASCII/list/boolean/string claims return 401 without a server error |
| Login/registration lacked local attempt throttling | Added bounded thread-safe per-process IP/endpoint limits: 30 attempts per five minutes, then 429 and Retry-After. No password/email enters limiter storage. Tests cover window expiry, separate keys, bounded capacity and protected-route independence |
| Unknown-email login skipped bcrypt work | A transient cached dummy hash ensures unknown accounts still perform password verification and cannot authenticate. This reduces the obvious timing shortcut; it is not a claim of constant network timing |
| WebSockets checked changed credentials only on client traffic/timeout | Validate credentials before every reading broadcast. A regression changes the provider hash during a connected socket and verifies closure with 1008 instead of delivery |
| SQLite runtime connections did not enable foreign-key enforcement | Enable foreign keys on backend engine connections, preventing future orphan writes. Existing rows are not rewritten. Test confirms orphan insertion is rejected |
| Invalid Unicode in password-change validation could raise an unexpected error | Invalid UTF-8 surrogate text now produces a sanitized 422 validation response |
| Backup existed but restore rehearsal/procedure was incomplete | Added restore-to-new-file helper: validate SQLite integrity, foreign-key references and nonempty tables; never overwrite an existing output or switch the active database. Disposable tests verify preservation and corrupt/empty/broken-FK rejection |
| Firmware could treat an existing unreadable/empty pending journal as absent | Fail closed when the pending key exists but cannot yield a payload; reference builds passed after this guard |
| Auth page displayed a fabricated decorative concentration | Replaced the example numeric PPM with “Raw sensor acquisition / Calibration pending”, preserving its existing layout |
| Configuration documentation described obsolete volatile sessions, ten-second warmup and no idempotency | Updated to persistent sessions/receipts, configurable disabled-by-default firmware, recovery, current authentication and safe restore procedure |

## Completed software components

- Provider registration/login/logout, protected navigation, patient creation/editing/details/history, account profile/password settings, scan simulation, reading filters/pagination/deletion, CSV export, dashboard and trends.
- Patient authentication/profile/password APIs, personal/latest history, mobile lifecycle refresh, session/profile race protection, synthetic/unavailable display utilities and Android export. Native device rendering remains unverified.
- Provider and patient ownership checks; device keys mapped to a provider/device; device submissions bound to patient/session/acquisition IDs; provider-only arming/cancellation; authenticated medical WebSocket subscriptions and per-event credential validation.
- Durable scan, simulation and acquisition receipt persistence; exactly-once reading creation; same-payload retries; deleted receipt tombstones; cancellation, expiry and replacement rejection; server-reopening/concurrency coverage.
- Non-destructive sensor/scan/simulation/preprocessing migrations and backup checks. Historical MQ-138 values remain preserved; they are historical prototype outputs, not evidence of validated chemical/clinical measurement.
- Separate raw TGS channels/baselines/sample bursts, finite environmental validation, median preprocessing, normalized features and version/provenance metadata. No unverified environmental coefficients were enabled.
- Disabled/unavailable model behavior, trusted-artifact/integrity/version/feature checks, paired real-data training readiness and metric calculation tests. Synthetic data is excluded from scientific training/evaluation evidence.
- Configurable firmware acquisition, structured authenticated JSON, baseline/detection/capture checks, durable device-bound outbox and receipt recovery; 18 actual C++ helper assertions and installed ESP32 reference compilation.

TGS and simulated readings do not generate gas concentration, monitoring band or glucose when calibration/model requirements are unavailable. Simulated records appear in history with explicit provenance but do not enter real trends or medical alerts. A “No real sensor readings” availability notice can remain for a patient with only simulated history; it is not an interpretation of synthetic measurements. Existing historical MQ-derived outputs are retained and labeled unverified/experimental rather than recalibrated or presented as newly validated data.

## Modified files in Step 7

This list covers Step 7 changes; earlier uncommitted work is retained separately.

| Area | Files |
| --- | --- |
| Authentication/security | `backend/auth.py`, `backend/auth_limits.py`, `backend/routes_auth.py`, `backend/routes_readings.py` |
| Patient validation/reset | `backend/schemas.py`, `backend/routes_patients.py`, `frontend-web/src/components/PatientDetailModal.jsx` |
| Persistence/recovery | `backend/database.py`, `backend/restore_database.py` |
| Firmware guard | `iot-prototype/esp32/esp32_breathdx/esp32_breathdx.ino` |
| Display/documentation | `frontend-web/src/pages/AuthPage.jsx`, `backend/CONFIGURATION.md`, `STEP7_FINAL_READINESS_REPORT.md` |
| Verification | `backend/tests/test_final_readiness.py`, `backend/tests/check_step7_integration.py`, `frontend-web/tests/step7-mobile.integration.mjs` |

The mobile source/design, database migrations, working patient database, lockfiles, model artifacts and private settings were not changed by Step 7. Existing tracked database/cache modifications from prior steps remain; no unrelated changes were staged or discarded.

## Actual final test results

| Check | Actual result |
| --- | --- |
| Complete backend unittest discovery | **148 passed**; includes 11 final-audit tests plus existing auth/ownership, persistence/concurrency, restart/recovery, migrations, simulation, preprocessing, firmware protocol and estimation safeguards |
| Client regression suite | **29 passed**, including actual-source lifecycle/handler tests, monitoring exclusion, pagination, error states, CSV escaping and URL handling |
| Provider ESLint | **Passed**, no errors/warnings |
| Provider production build | **Passed**, 662 modules |
| Expo Android export | **Passed**, 2,963 modules, Hermes bundle/metadata under `output/mobile-step7-check`; not an installed-app test |
| Final firmware default + pin-probe builds | **Both passed**, ESP32 Dev Module (`esp32:esp32:esp32`), core 3.3.8, ArduinoJson 7.4.3, DHT 1.4.7; all **18 C++ acquisition assertions** enabled in each |
| Firmware source/build copy check | **Matched**; no private headers included in public verification builds; no upload performed |
| Actual web/mobile Axios client integration | **Passed**: disposable provider/patient accounts, profile synchronization, ownership/role rejection, complete scan, repeat prevention, service recovery, deletion/tombstones, credential invalidation and anonymous denial |
| Browser scan → actual mobile API | **Passed**: one distinct saved Demo Patient synthetic record, matching latest/history, ownership, preprocessing provenance and unavailable outputs |
| Complete existing integration-script runner | **Passed all five checks** on the final backend: Step 4 preprocessing/scan HTTP workflow, original mobile API/database check, final mobile provenance, web/mobile account/ownership/recovery and 21-record multi-page history synchronization |
| Backup/restore rehearsal | **Passed** using temporary disposable SQLite databases; existing outputs refused; corrupt/empty/broken-FK sources rejected; legacy/null sample history preserved |
| Working database read-only audit | Integrity **ok**, **0 foreign-key violations**, required final reading fields present; SHA-256 unchanged from audit baseline. No patient rows were dumped or changed |
| Root and nested-mobile whitespace checks | **Passed** |

Backend tests use private apps and isolated databases, not import-time `main.py` table creation. Model tests use controlled mock artifacts, not real training or model accuracy evidence. Mobile lifecycle/handler tests execute actual source with controlled platform/storage adapters; mobile API tests use actual Axios helpers/interceptors against the disposable fixture. They are not full React Native renderer or phone UI tests.

Initial Step 7 test output included imported pre-existing test classes twice; the unused imported class was removed before final discovery. The final count above is the complete current suite. Known non-failing diagnostics remain: passlib/bcrypt version reporting, naive-UTC deprecation notices and deliberately triggered sanitized backend fault logs. No dependency upgrades were used to silence them.

### Browser evidence

The loopback provider app at `127.0.0.1:5179` used the in-memory fixture at `127.0.0.1:8012` and disposable identities only.

- Provider login was exercised before the interruption; the resumed browser restored that valid disposable session.
- Patient list/details and patient-context navigation to Live Scan worked. A stale reference from an earlier destroyed test fixture returned “session not found”; its explicit discard control restored the selector without affecting database records.
- Start Test → instructions → Continue → waiting → scripted detection/capture/processing → completed at 100% saved exactly one synthetic reading.
- History and dashboard showed the saved record, raw TGS values, synthetic labels and unavailable concentration/glucose/band. Actual mobile API retrieval matched that record.
- Trends showed zero monitoring-band counts and no concentration chart despite synthetic history.
- The actual Export control downloaded CSV. Inspected contents preserved synthetic provenance and `simulated_data` availability; CSV/unit tests verify blank unavailable medical columns and spreadsheet-formula protection.
- A test-only 503 displayed Retry instead of empty data. Restoring the fixture and clicking Retry recovered the patient list with the provider session intact.
- At 390 × 844, dashboard document width equaled viewport width (390), with no page-wide horizontal overflow. The override was reset. This is browser responsiveness evidence, not phone evidence.

Screenshot: `output/step7-readiness.png`, containing only disposable synthetic data. Broader provider creation/editing/account/logout/unauthorized navigation, pagination/deletion and session-restoration browser scenarios already passed in Step 5; their regression/API tests were rerun here. They were not all repeated manually in this final browser pass. Browser password entry/change was not automated; API and actual handler tests provide the software evidence.

## Security audit and remaining software limitations

Protected APIs enforce role/object ownership, and device credentials cannot retrieve patient history/manage accounts/delete readings. Missing/invalid/expired authentication, malformed JWT claims, bad readings and inactive scan sessions fail explicitly. WebSocket tokens stay in the first authentication frame rather than URLs. Private firmware/backend settings remain ignored; screenshots/logs/tests do not expose real credentials or patient measurements.

Remaining limits must be addressed before public/production use:

- LocalStorage/AsyncStorage are not encrypted credential vaults. Ordinary client logout clears local state but does not independently revoke an issued JWT. Password changes invalidate previous credentials; sensitive WebSocket broadcasts now recheck them.
- Authentication throttling is per process, bounded and reset on restart. It is not distributed rate limiting or comprehensive denial-of-service defense. Provider self-registration is a capstone workflow, not verification of clinical credentials.
- WebSocket fan-out remains process-local; use one worker for reliable prototype notifications. Durable REST polling/status and database concurrency tests remain available. Public deployment needs shared notification infrastructure if multiple workers are required.
- Historical databases and Python caches are already tracked in Git. Current ignore rules do not erase tracked history or previously embedded secrets. Do not publish the repository/database/credential-bearing images as-is. Review/redact sensitive history and rotate previously exposed secrets through their owning systems. The audit preserved the user's Git/data instead of rewriting history or deleting files.
- Full assistive-technology, keyboard-only cross-screen and native mobile responsiveness/accessibility testing is not complete. Tested labels, modal behavior, error states and narrow browser layouts are a useful subset, not accessibility certification.
- Migration scripts and tests exist, but no full migration framework, retention enforcement, durable security audit trail or self-service account recovery system was introduced. These are outside this bounded capstone audit.
- Historical MQ-138 concentration/band outputs remain unverified prototype history/compatibility data; software preservation does not establish their accuracy. No new TGS concentration calibration has been invented or enabled.
- Backup restore safely produces a new validated file; switching an active deployment's database still requires a deliberate stopped-service maintenance procedure. Never restore over an active database.

These limits are documented rather than hidden behind a 100% completion claim. No new frontend/mobile features or deployment services were added.

## Completion and readiness percentages

### Software completion / verification checklist: **95%**

This is a transparent engineering checklist score for the requested local capstone scope, not a percentage of code written, a security guarantee or clinical accuracy. Each gate has equal weight; verified = 1, partially verified = 0.5, not verified = 0.

| Software gate | Score |
| --- | --- |
| Authentication, roles, password/token rejection | 1 |
| Provider/patient object ownership | 1 |
| Device authentication and scan binding | 1 |
| Patient creation/editing/details/history protection | 1 |
| Account profile/password/reset workflow | 1 |
| Persistent scan lifecycle | 1 |
| Full synthetic scan stages/storage | 1 |
| Acquisition uniqueness/receipts/tombstones | 1 |
| Cancellation/expiry/replacement/network recovery | 1 |
| Durable server/device protocol restart recovery | 1 |
| Migration/historical data compatibility | 1 |
| Integrity/backup/new-file restore | 1 |
| Raw sensor validation/preprocessing metadata | 1 |
| Model loading/availability/integrity safeguards | 1 |
| Synthetic labeling and real-trend exclusion | 1 |
| Web navigation/history/trends/CSV and lint/build | 1 |
| Mobile API/lifecycle and Android export | 1 |
| Firmware reference builds/core contract checks | 1 |
| Complete responsive/accessibility verification | 0.5 |
| Complete native mobile UI/runtime integration evidence | 0.5 |

Total **19/20 = 95%**. The last two gates require further runtime/device/assistive testing. Production safeguards listed above are outside this local capstone scoring boundary and cannot be inferred from the score.

### Overall prototype testing-readiness: **70%**

This measures preparation/evidence across ten equal readiness gates, not completed hardware tests or prediction accuracy. Seven prepared gates: runnable application stack; authenticated ownership/device contracts; durable acquisition/recovery; safe data/migration/backup rehearsal; synthetic end-to-end tests; firmware reference builds/private configuration templates; documented repeatable local/bench procedures. Three open gates: exact-board/electrical acceptance; actual ESP32/mobile connectivity and power-loss/sensor operation; experimentally supported acquisition/calibration/paired-data protocol evidence. Thus **7/10 = 70%**.

Missing scientific data is not replaced with simulated measurements or fabricated model metrics. The software can be demonstrated now; physical integration and scientific claims cannot be approved from these scores.

## Remaining hardware/scientific tasks

Identify the physical board, ADC-capable pins, analog input protection, heater/circuit supplies, ground/pull-ups and Wi-Fi ADC coexistence. Measure independent channels and verify DHT behavior. Determine empirical warmup/stability, baseline conditions, channel polarity/detection/quality limits and sampling timing. Verify firmware TLS/time synchronization, actual flash/NVS power-loss recovery and same-ID retry under real network interruptions. Compile for the exact board and manually upload only after electrical review.

Run the patient app on a compatible physical phone/emulator: login/logout, account settings, tab focus/foreground, refresh/history/results, keyboard/safe areas, offline recovery and synthetic/unavailable labels. No physical phone or emulator UI was used in this audit.

Collect consented/de-identified real experimental paired sensor/reference measurements. Establish concentration/environmental calibration and selectivity evidence separately. Train/evaluate the prepared glucose pipeline only with valid real data and patient-separated evaluation; report actual MAE/RMSE/R² and limitations. No physical calibration, real dataset fitting, glucose accuracy or clinical validation was performed.

## Exact local verification procedure

Use the existing installed runtimes/dependencies. Do not install/upgrade automatically. Start commands from the named folder.

### 1. Automated checks

From `backend`:

```powershell
.\venv\Scripts\python.exe -B -m unittest discover -s tests -q
# Focused safe restore/security rehearsal (disposable databases only):
.\venv\Scripts\python.exe -B -m unittest discover -s tests -p test_final_readiness.py -v
```

From `frontend-web`:

```powershell
node --test tests/monitoring.test.mjs tests/integration.test.mjs
npm run lint
npm run build
```

From `frontend-mobile`:

```powershell
node node_modules/expo/bin/cli export --platform android --output-dir ../output/mobile-step7-check
```

From repository root:

```powershell
.\iot-prototype\tests\compile_firmware.ps1
```

Public firmware verification excludes private headers, uses installed libraries and compiles acquisition-disabled reference profiles. Pin-probe values are compiler fixtures, not proposed wiring. No upload occurs.

### 2. Disposable end-to-end demonstration

Terminal 1, `backend`:

```powershell
.\venv\Scripts\python.exe -B -m uvicorn ui_fixture:app --app-dir tests --host 127.0.0.1 --port 8012 --no-access-log
```

Terminal 2, `frontend-web`:

```powershell
$env:BREATHDX_BACKEND_URL = 'http://127.0.0.1:8012'
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Open `http://127.0.0.1:5179`. Disposable provider: `demo@example.com`; disposable patient: `patient@example.com`; both use test-only password `Test-Only-Password`. Existing browser storage may reference a destroyed fixture: sign out/re-login, or discard a pending simulation **only after its status confirms no session exists**.

Sign in → Patients → Demo Patient details → Live scan → Simulation → Start Test → Continue. Observe waiting/detection/capture/processing/completion, then History/Dashboard/Trends and export CSV. Synthetic labels must remain visible and medical outputs unavailable.

From `frontend-web`, run:

```powershell
node tests/step5-api.integration.mjs
node tests/step7-mobile.integration.mjs
```

The first creates separate unique disposable accounts and checks both API clients/ownership/recovery/password invalidation. The second requires a completed browser Demo Patient scan and verifies actual mobile latest/history/provenance against it. These scripts are fixed to the loopback fixture; they do not target the real patient database.

For **all available integration scripts**, restart only the disposable fixture so its
reading/receipt counts are zero, then from `backend` run:

```powershell
.\venv\Scripts\python.exe -B tests/check_step7_integration.py
```

The runner refuses a nonempty fixture rather than deleting test data. It executes
the Step 4 HTTP workflow, original mobile API check, final mobile provenance check,
web/mobile account/recovery check and multi-page history integration in the order
their fixtures require. It prepares only synthetic patients/scans through real APIs;
this is automated API integration, not additional browser/phone UI evidence.

Test-only outage controls (restore service before continuing):

```powershell
Invoke-RestMethod -Method Post 'http://127.0.0.1:8012/__test/unavailable?enabled=true'
# Inspect Retry/error state, then:
Invoke-RestMethod -Method Post 'http://127.0.0.1:8012/__test/unavailable?enabled=false'
```

For multi-page deletion/creation/editing browser rehearsal, follow the Step 5 report and its `step5-history.integration.mjs` procedure with the browser-created test patient. Stop both servers with Ctrl+C. Fixture restart discards all its in-memory test data. Open a fresh shell or remove `Env:BREATHDX_BACKEND_URL` before normal development.

### 3. Backup/restore rehearsal and maintenance

The focused final-readiness tests above create disposable source/backup/restored databases, preserve sample legacy/null history and test no-overwrite failures. No restore rehearsal should name `backend/diabetes_monitoring.db` as an output.

For a deliberately created disposable SQLite source, from `backend`:

```powershell
.\venv\Scripts\python.exe -B backup_database.py --source PATH_TO_DISPOSABLE_SOURCE.db --output NEW_PRIVATE_BACKUP.db
.\venv\Scripts\python.exe -B restore_database.py --source NEW_PRIVATE_BACKUP.db --output NEW_PRIVATE_RESTORED.db
```

Replace placeholders; outputs must not already exist. Verify schema, integrity, foreign keys and expected history before any maintenance switch. The helper does not overwrite originals or switch the active API database. Stop the API, preserve a fresh backup and reconcile database paths before a real manual switch. Keep all backups private.

### 4. Normal local application startup

Verify private settings in `backend/CONFIGURATION.md`, existing schema/migrations and backups. Do not run migrations blindly over a live database; migration preservation/idempotency is covered by isolated tests. Existing installations require the sensor → scan → simulation → preprocessing migration sequence only when their schema is not current.

Backend, from `backend`:

```powershell
.\venv\Scripts\python.exe -B -m uvicorn main:app --reload --host 127.0.0.1 --port 8001 --no-access-log
```

Provider web, from `frontend-web`:

```powershell
npm run dev
```

Patient mobile, from `frontend-mobile` (separate Metro port):

```powershell
$env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:8001' # Android emulator only
npm run start:lan -- --port 8081
```

Use a compatible installed SDK 57 runtime/development build. A physical phone needs a reachable explicitly configured private backend address; loopback and `10.0.2.2` do not reach the laptop from a phone, and Metro tunneling does not tunnel FastAPI. Configure private-LAN exposure deliberately and use disposable identities/data for device verification. Do not expose the loopback test fixture publicly.

After hardware becomes available, repeat the software suite and disposable workflow first, then follow the Step 6 electrical/configuration/manual-upload checklist and record actual physical results. Firmware collection remains disabled until verified configuration is supplied. Do not enable an estimation model without trusted artifact, evaluation and calibration/data evidence. No physical testing or Step 8 was performed by this audit.
