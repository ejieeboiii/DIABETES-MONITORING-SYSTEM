# BreathDX Step 3 — Sensor simulation workflow

Verified on 2026-10-14. Step 4 has not been started.

## Outcome

The existing provider Live Scan now supports a provider-controlled, authenticated simulation of a complete scan. Its sequence is Start Test → Instructions → Waiting → Simulated Detection → Capture → Processing → Results saved to History. The processing transaction saves the result automatically; a second Save operation is unnecessary and would risk duplicate records.

Simulation produces synthetic raw TGS822 and TGS2620 ADC counts, both baseline counts, temperature in Celsius, and humidity in percent. It does **not** produce concentration, monitoring bands, glucose estimates, or medical interpretations. These fields remain null/unavailable. Scripted detection and phase timing are software tests, not a physically validated breath-detection algorithm.

Existing manual entry, physical-device listener APIs, authentication, patient ownership, navigation, and historical readings remain in place. The project was extended, not rebuilt.

## Inspection and completed features

Steps 1 and 2 already supplied dual-sensor validation, persistent scan sessions, provider/device authentication, terminal-state protection, acquisition receipts, duplicate prevention, history REST endpoints, and live notifications. Step 3 reuses these components.

- **Separate simulation channel:** `POST /readings/simulations`, `GET /readings/simulations/{session_id}`, and `POST /readings/simulations/{session_id}/advance` require the owning provider's JWT. Cancellation uses the existing `POST /readings/scans/{session_id}/cancel` endpoint. No device secret is sent to the browser.
- **Durable identity:** the browser creates one secure UUID for a start request and retains it with its settings until the outcome is resolved. The server stores one acquisition UUID and one synthetic payload in `simulation_runs`. Repeating the same start is idempotent; different settings with the same ID are rejected.
- **Correct binding:** each completed record contains patient ID, provider ID, session ID, acquisition ID, and a logical simulator identity `simulator-provider-{provider_id}`.
- **Origin separation:** readings carry persisted `is_simulated=true`. The related simulation state is also persisted. Ordinary manual or device submissions cannot complete a simulation session. Physical firmware polling cannot discover a simulation as an armed hardware scan. The parent session's existing `source=manual` describes provider authentication/transport; it does not indicate physical acquisition. The simulation route, run table, device identity, and reading flag explicitly identify synthetic origin.
- **Validated configurable ranges:** each gas count range must be an ordered integer range within 1–4094; baseline ranges allow 0–4094, matching the existing ingestion contract. Temperature supports −40 to 80 °C and humidity 0–100%, with finite numeric bounds. Timing supports 0.5–10 seconds per phase and 15–900 seconds per session. Default ranges are test settings, not calibration parameters.
- **Progress and terminal states:** instructions, waiting, detecting, capturing, processing, completed, failed, cancelled, timed out, and replaced have distinct visible messages. Progress reaches 100% only for a saved completion.
- **Exactly one save:** simulation completion calls the existing ingestion implementation. Session completion, synthetic provenance, the reading, and acquisition receipt are committed together. Duplicate completion requests and completed-page reloads do not create another record or notification. A deliberately deleted reading cannot be recreated by replay.
- **Failure recovery:** HTTP/storage failures retain the same ID and payload. Automatic advancing pauses on request errors; the provider can check status/retry the same test. A confirmed missing session can be discarded safely. Invalid persisted sensor values fail without saving a reading. Cancelled, expired, or replaced sessions cannot acquire new data.
- **Visible provenance:** Live Scan results, provider dashboard, reading history, patient detail, CSV exports, and both patient mobile reading-card components identify simulated data. Mobile cards label even compact history previews.
- **Monitoring exclusion:** both clients' trend, average, and chart helpers exclude simulated records, including a synthetic record containing a numeric PPM value. Provider band counts and reading-history concentration charts exclude them. Simulated records do not supply the latest real reading for provider alerts or personalized mobile tips. A patient with only simulations can still correctly receive the existing no-real-data alert. History remains visible and labelled; total history counts include synthetic records.

The synthetic payload is generated and persisted once at start, then consumed during the scripted capture/processing flow. There is no physiological formula, correlation model, sensor calibration, or background service. Closing the browser stops explicit phase advancement; the persisted session can resume before its deadline. Expiry is evaluated on the next authenticated status/transition request.

## Issues found and fixed during verification

1. Reload initially reopened manual mode and did not restore the simulated scan's selected patient. Live Scan now restores simulation mode and patient context from the durable run.
2. A previously completed result could remain visible below a newly started or cancelled test. Preparing/starting another test now clears that result. Clicking the already selected Simulation tab preserves its current result.
3. A restored result could use a generic patient label while the patient list was loading. The result now resolves the saved reading's patient ID against the current patient list.
4. Blank numeric configuration fields could be coerced to zero in the browser. Missing ranges/timing fields are now rejected before creating a request.
5. Simulator baseline validation initially excluded zero despite the existing API allowing it. The simulator now accepts zero baselines; a regression test confirms this without creating derived medical values.

## Modified files for Step 3

This list distinguishes Step 3 from the extensive pre-existing, uncommitted Step 1/2 and review changes. No prior changes, nested repository, lockfiles, model artifacts, or local environments were reset.

| Area | Files | Changes |
| --- | --- | --- |
| Backend simulation | `backend/simulation.py` | Validated configuration, durable samples, provider ownership, scripted progress and completion using existing ingestion |
| Persistence/contracts | `backend/models.py`, `backend/schemas.py`, `backend/sensor_auth.py`, `backend/listener_session.py`, `backend/routes_readings.py` | Simulation table, reading flag, internal simulator actor, stable session start ID, separated ingestion channel, unconditionally unavailable medical outputs |
| Migration/startup | `backend/migrate_simulation.py`, `backend/main.py`, `backend/diabetes_monitoring.db` | Safe additive migration, explicit startup guard, applied schema update without historical-data changes |
| Provider workflow | `frontend-web/src/components/SimulationScan.jsx`, `frontend-web/src/pages/medical/LiveScan.jsx`, `frontend-web/src/utils/api.js` | Simulation controls, instructions, configurable ranges, progress, cancel/retry and restoration |
| Provider consumers | `frontend-web/src/pages/medical/Dashboard.jsx`, `frontend-web/src/pages/medical/Readings.jsx`, `frontend-web/src/components/PatientDetailModal.jsx`, `frontend-web/src/utils/monitoring.js`, `frontend-web/src/utils/exportReadings.js` | Origin labels, synthetic-data exclusion and explicit CSV provenance |
| Patient mobile | `frontend-mobile/src/components/PatientReadingCard.js`, `frontend-mobile/src/components/PatientLatestReadingCard.js`, `frontend-mobile/src/utils/monitoring.js`, `frontend-mobile/src/screens/patient/DashboardScreen.js`, `frontend-mobile/src/screens/patient/HealthTipsScreen.js` | Synthetic-data banners, monitoring exclusion and no personalized interpretation from synthetic records |
| Backend verification | `backend/tests/test_simulation.py`, `backend/tests/test_simulation_concurrency.py`, `backend/tests/test_simulation_migration.py`, `backend/tests/ui_fixture.py` | Complete workflow, isolation, recovery, competing workers, migration preservation and disposable browser fixture |
| Client verification | `frontend-web/tests/monitoring.test.mjs`, `frontend-web/tests/mobile-api.integration.mjs` | Exclusion tests for both clients, CSV provenance, actual mobile API helper integration |
| Documentation | `STEP3_SIMULATION_REPORT.md` | Results, limits, file inventory and local testing instructions |

The mobile directory remains a separate Git repository with its existing changes preserved. Firmware was inspected as part of the acquisition trace; no simulation was added to physical ESP32 firmware.

## Actual verification results

| Check | Actual result |
| --- | --- |
| Backend `python -B -m unittest discover -s tests -q` | **99 tests passed**, including existing Step 1/2 regressions and 19 Step 3 tests |
| Client `node --test tests/monitoring.test.mjs` | **13 tests passed**, covering both clients and CSV handling |
| Web `npm run lint` | Passed, no lint errors |
| Web `npm run build` | Passed; Vite compiled 660 modules |
| Mobile Android export | Passed; Expo compiled 2,961 modules and emitted the Android Hermes bundle and assets |
| Actual mobile Axios helper integration | Passed against the disposable backend; `loginPatient`, `getMyReadings`, and `getMyLatestReading` fetched the same saved synthetic records using patient authentication |
| Browser workflow | Successful simulation, instructions, progress, reload/resume, completed-page reload, cancellation, timeout, missing inputs, reversed ranges, safe discard, controlled 503 and retry verified |
| Browser consumers | Dashboard/history labels visible; CSV downloaded and its synthetic provenance checked; monitoring charts empty and band counts zero for synthetic-only history |
| Browser/database result | After two completed tests, exactly **two readings, two acquisition receipts, two unique acquisition IDs and two unique session IDs**; both belonged to the selected patient/provider. Cancelled, timed-out and invalid tests added no records |
| Working-database migration | Applied with an exclusive private backup; every original table's values and row counts compared before commit and again read-only after commit. Integrity, foreign-key and startup-schema checks passed |
| Git whitespace checks | Root and nested mobile `git diff --check` passed; only existing LF/CRLF conversion notices |

Backend workflow tests use isolated synthetic databases, including temporary file-backed SQLite databases for concurrency and restart tests. Browser testing used a separate disposable shared-memory SQLite fixture; it did not use real patient records. No synthetic test readings were inserted into the working patient database. The working database received only the additive schema update. Historical MQ-138 data and existing patient/scan/receipt history were preserved. Existing readings default to `is_simulated=false`, meaning not previously tagged as simulated, not proof of physically verified origin.

Fault-injection tests intentionally emit storage/notification/estimator errors. Existing passlib/bcrypt version-reporting warnings and UTC deprecation warnings remain; authentication tests and fixture sign-in passed. Vite/Expo emitted non-fatal performance/environment warnings. No dependencies were installed or upgraded.

Browser completion evidence is saved locally at `output/step3-simulation-completed.png` (synthetic test account only). Verification exports/build output are ignored artifacts.

## Testing locally with a disposable database

Use three PowerShell terminals, starting at `C:\Users\Kian\Diabetes-Monitoring-System`. Existing dependencies are required; these commands do not install anything.

### Terminal 1 — isolated backend

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\backend
.\venv\Scripts\python.exe -B -m uvicorn ui_fixture:app --app-dir tests --host 127.0.0.1 --port 8012 --no-access-log
```

This fixture never imports `main.py`, seeds only synthetic accounts, and uses a disposable database. Its data disappears when the fixture process stops. Test-only `__test` routes are not registered in the normal backend.

### Terminal 2 — provider web app

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\frontend-web
$env:BREATHDX_BACKEND_URL = 'http://127.0.0.1:8012'
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

If this shell has a custom `VITE_API_URL`, remove that override for this check so requests use Vite's fixture proxy. Open `http://127.0.0.1:5179/`. Sign in using the **disposable fixture account only**: `demo@example.com` / `Test-Only-Password`.

1. Open Live Scan, choose Demo Patient, then Simulation.
2. Optionally open Configure synthetic test ranges. Defaults are sufficient for a normal test.
3. Click Start Test — Simulation. Confirm the test-patient context and click Continue simulated test.
4. Observe the scripted phases and Completed — saved to history. Default phase timing is two seconds; polling/network timing adds some delay.
5. Open Readings History and Dashboard. Confirm the SIMULATED labels and unavailable medical outputs. Download CSV and check the Simulation provenance column. Trends should remain empty if history contains only simulations.
6. Reload during instructions or acquisition to resume the same session. Reload a completed result and confirm history count remains unchanged.
7. Prepare another test and cancel it. Confirm history count stays unchanged.
8. To test expiry, configure timeout to 15 seconds and leave the test on Instructions. It should show Timed out after status polling observes the deadline.
9. Try an empty configuration field or a reversed ADC range. Missing fields are rejected locally; reversed ranges receive validation errors. Discard only if no session exists confirms absence before resetting an unacknowledged/invalid start.

### Terminal 3 — verify the actual patient API helper

After at least one completed browser simulation:

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\frontend-web
node tests/mobile-api.integration.mjs
```

The integration check loads the actual mobile Axios helper source and supplies test storage/base-URL adapters for the native environment. It uses fixture patient `patient@example.com` / `Test-Only-Password`. It verifies patient ownership, nullable medical outputs, raw/baseline fields, matching history/latest records, and aggregate database uniqueness. It prints no tokens or patient payloads. This is a transport/contract check, **not a running phone UI test**.

Optional controlled network-error check while a test is on Instructions:

```powershell
Invoke-RestMethod -Method Post 'http://127.0.0.1:8012/__test/unavailable?enabled=true'
```

Wait for the error message, restore the fixture, then click Check status / retry same test:

```powershell
Invoke-RestMethod -Method Post 'http://127.0.0.1:8012/__test/unavailable?enabled=false'
```

Continue the recovered test and confirm one saved record for that session. Stop both test servers with Ctrl+C when finished. Remove the test proxy override from any reused web shell with `Remove-Item Env:BREATHDX_BACKEND_URL -ErrorAction SilentlyContinue`.

## Running with the normal development database

The Step 3 migration has already been applied to this checkout. For another existing Step 2 database, stop its API and other writers first, then run from `backend`:

```powershell
.\venv\Scripts\python.exe -B migrate_simulation.py
```

The migration is idempotent, retains a private backup in `backend/backups`, refuses partial/inconsistent schemas, and compares original records before committing. Keep backups private and retain the matched code/schema when restoring. `create_all()` does not replace this migration.

Start the normal backend:

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\backend
.\venv\Scripts\python.exe -B -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

Start the normal web app in another shell without the fixture proxy override:

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\frontend-web
npm run dev
```

Use your existing provider account and selected patient. Simulation creates a labelled synthetic history record in whichever database this backend serves; use test accounts for testing. Device-key configuration is unnecessary for simulation. Real ESP32 acquisition continues to use its existing authenticated listener/device workflow.

## Repeating automated checks

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\backend
.\venv\Scripts\python.exe -B -m unittest discover -s tests -q
```

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\frontend-web
node --test tests/monitoring.test.mjs
npm run lint
npm run build
```

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\frontend-mobile
node node_modules/expo/bin/cli export --platform android --output-dir ../output/mobile-step3-check
```

## Remaining verification and limits

- **Physical patient mobile runtime is unverified.** The actual API helpers, both clients' monitoring utilities, mobile-card source labels and Android export were verified. A phone/emulator was not used to confirm rendered cards, touch behaviour, pull-to-refresh or LAN connectivity. React Native Web is not installed, and no dependencies were added to manufacture a browser substitute.
- To manually check the patient application, set `EXPO_PUBLIC_API_URL` to the backend reachable from that device and run `npm run start:lan -- --port 8081` from `frontend-mobile`. An Android emulator can use `http://10.0.2.2:8012` for the running disposable fixture; a physical phone requires the laptop's reachable LAN backend address. Restart Expo after changing this environment variable. Sign in to the matching patient's account and refresh Dashboard/Results. Check the synthetic-data banner and unavailable outputs. This manual procedure has not been executed on a device.
- **Physical ESP32, TGS822/TGS2620, DHT22, warmup, breath detection, ADC wiring and calibration are unverified.** Scripted simulation provides no evidence of chemical selectivity or clinically valid measurement.
- Simulation results remain unavailable for concentration, monitoring bands and glucose estimates. No model was trained or selected for simulation.
- Simulation progression is provider/browser driven. There is no unattended background acquisition service; stored runs resume or expire according to their original deadline.
- Existing dependency warnings remain outside Step 3 scope. No Step 4 features, redesign, framework upgrade or new service was introduced.
