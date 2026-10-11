# BreathDX — AI Coding Assistant Guide

## Purpose and scope

BreathDX is a capstone prototype for non-invasive diabetes monitoring through breath analysis. It combines ESP32 acquisition, environmental measurements, a FastAPI API, SQLite persistence, a healthcare-provider web dashboard, and a patient mobile app.

All predicted glucose values are **experimental estimates, not medical diagnoses**. Breath measurements, prototype monitoring bands, and model predictions do not replace validated blood glucose measurement or professional evaluation. Do not claim clinical accuracy, diagnostic capability, or treatment suitability without evidence.

This guide describes source inspected on 2026-10-11. Recheck the affected source and manifests before implementing changes; comments and documentation can lag behind code.

## Working rules

- Read this file and any applicable nested `AGENTS.md` before editing. `frontend-mobile/AGENTS.md` has additional Expo guidance; its SDK 54 documentation reference differs from the current Expo 57 manifest. Surface that discrepancy and use the installed version when assessing compatibility.
- Use the relevant existing `.agents/skills/` guidance where useful, but verify its statements against source. Preserve those skills.
- Inspect `git status --short` first. Preserve user changes, nested repositories, lockfiles, local environments, database files, and model artifacts.
- Keep changes within the requested scope. Documentation work must not silently fix application code, UI, API contracts, database schemas, or firmware.
- Trace acquisition, request schema, route, persistence, response, and client consumer together before changing a data contract.
- Do not install dependencies, upgrade frameworks, retrain models, migrate data, or introduce new services unless the task authorizes it.
- Distinguish implemented behavior, disconnected source, known defects, and planned work. A filename, import, button, or schema alone does not establish a working feature.
- Report what changed, what was checked, and any unavailable runtime or hardware verification. Do not claim tests passed when commands were only inspected.

## Architecture and project organization

| Area | Source and responsibility |
| --- | --- |
| `backend/` | FastAPI application, authentication, patient/readings routes, SQLAlchemy models and Pydantic schemas; run from this directory because imports and SQLite URL are relative. |
| `backend/ml/` | Separate multi-feature Linear Regression training and inference utilities, CSV template, model bundle and metric output paths. |
| `frontend-web/` | Provider React application. `src/App.jsx` defines routes; `src/pages/medical/`, `components/`, `context/`, `hooks/`, and `utils/` implement screens and shared behavior. |
| `frontend-mobile/` | Expo patient application. `App.js` uses `src/navigation/AppNavigator.js`; screens, reusable components, auth context, utilities, and theme live under `src/`. |
| `iot-prototype/` | Hardware guides and `esp32/esp32_breathdx/esp32_breathdx.ino`, the actual Arduino acquisition sketch. |
| `firmware/` | No implementation files found; do not describe it as the active firmware. |
| `.agents/skills/` | Existing project-specific assistant guidance. |

### Technologies

- Backend requirements pin FastAPI 0.115.6, Uvicorn 0.34.0, SQLAlchemy 2.0.36, and Pydantic 2.10.4, with python-jose, bcrypt/passlib, python-dotenv, and email-validator. `requirements.txt` includes `ml/requirements-ml.txt` for ML dependencies.
- Web manifest declares React 19, React Router 7, Vite 8, Axios, Recharts, and ESLint. Tailwind 3 is used through PostCSS with autoprefixer. An additional Tailwind 4 Vite package is declared, but `vite.config.js` only registers the React plugin; do not assume a Tailwind 4 migration has occurred.
- Mobile manifest declares React 19.2.3, React Native 0.86.3, Expo `~57.0.25`, React Navigation 7, Axios, AsyncStorage, lucide-react-native, react-native-svg, safe-area and gesture support.
- Hardware uses Arduino ESP32 with WiFi, HTTPClient, and the DHT library. No PlatformIO configuration or automated firmware build was found.
- Model utilities use scikit-learn, pandas, NumPy, pickle, and joblib. Multiple independent model paths exist; they are not interchangeable.

### Implemented flow and roles

The sensor route receives raw ADC, temperature, humidity, and a patient ID; converts ADC to the field named `acetone_ppm`; classifies a prototype band; saves a reading; and broadcasts `reading_created` to authenticated medical WebSocket subscribers. Clients retrieve stored readings through REST and compute monitoring summaries locally.

Backend roles are `medical` and `patient`; there is no separate admin role/table. Providers register and log in, create/manage their patients, reset patient passwords, inspect/delete readings, and view trends. Patient accounts are created by providers. The active mobile navigator provides login and Dashboard, Results, Trend, and Tips tabs with identity/logout controls.

Web routes are `/`, `/medical/dashboard`, `/medical/patients`, `/medical/readings`, `/medical/trends`, and `/medical/livescan`. Patient web pages and medical mobile screens exist but are not wired into the active runtime navigators. Neither active navigator implements a dedicated profile-edit screen.

### Current gaps and planned functionality

- The stated hardware direction is ESP32 + TGS2620 + TGS822 + DHT22. The checked-in acquisition sketch implements **MQ-138 on GPIO 34 and DHT22 on GPIO 4**. TGS2620/TGS822 acquisition, distinct payload fields, and database columns were not found. Treat their integration as planned; do not rename MQ-138 data or apply its conversion to another sensor without calibration evidence.
- Web listener calls reference `/readings/listener/ping`, `/start`, and `/stop`; firmware polls `/readings/listener/armed-patient`. These listener routes are absent from the registered backend. `listener_session.py` and listener schemas do not complete that integration. Restarting the server alone cannot create missing routes.
- `routes_readings.py` imports `predict_glucose` but does not call it or populate `predicted_bgl`. A nullable model/schema field does not mean end-to-end estimation works. Some web consumers expect `estimated_glucose_mg_dl` and `glucose_level`, which `ReadingResponse` does not provide.
- Baseline-related helpers exist in `classifier.py`, and `SensorData` accepts `baseline_adc`, but sensor ingestion neither passes it to conversion nor calls breath-signal validation.
- Do not promise successful listener-driven hardware scans, calibrated acetone measurement, integrated glucose estimates, or clinical validation from the current source.

## Backend and API contracts

`main.py` registers `routes_auth.py`, `routes_patients.py`, and `routes_readings.py`. It exposes `/` and `/health` and creates tables at import time. `route_suggestion.py` is not registered there.

| Prefix | Existing operations |
| --- | --- |
| `/auth` | `POST /medical/register`, `/medical/login`, `/patient/login`; `GET /medical/me`, `/patient/me`. |
| `/patients` | `POST /`, `GET /`, `GET /{patient_id}`, `DELETE /{patient_id}`, `POST /{patient_id}/reset-password`, `GET /me/profile`. |
| `/readings` | `POST /sensor`; `GET /all`, `/patient/{patient_id}`, `/patient/{patient_id}/latest`, `/my`, `/my/latest`; `DELETE /{reading_id}`; WebSocket `/ws/medical`. |

Preserve methods, paths, JSON names, enum values, nullable fields, units, status codes, and WebSocket event shapes unless changing the contract is explicitly in scope. Put API calls and URL construction in each client's `src/utils/api*` modules. Keep business calculations out of visual components where a shared utility already exists.

Use Pydantic for request validation and SQLAlchemy for persistence. In future authorized validation changes, check finite values, ADC bounds, environmental ranges, patient ownership, and optional-field behavior. Do not turn an invalid reading into a plausible measurement. Preserve explicit `HTTPException` responses; distinguish validation, authentication, forbidden access, missing resources, network failure, and unexpected server errors.

## Coding standards and naming

- Match adjacent source style and avoid unrelated formatting or architectural rewrites. The repository uses JavaScript/JSX rather than TypeScript for clients.
- Python: four-space indentation; `snake_case` functions, variables, and modules; `PascalCase` classes; `UPPER_SNAKE_CASE` constants. Add meaningful type hints to new processing/API helpers.
- React/React Native: `PascalCase` components/screens and matching filenames, `camelCase` functions/state, and `useX` hook names. Use functional components and observe hook dependencies and cleanup rules.
- Keep API/database fields in their established `snake_case`, even when surrounding JavaScript uses `camelCase`. Do not rename persisted enum values for display purposes.
- Reuse `components/`, `context/`, `hooks/`, `utils/`, and mobile `theme/`. Avoid duplicate pages/utilities or editing similarly named inactive files instead of active imports.
- Clean up timers, subscriptions, and WebSockets on unmount; avoid stale asynchronous updates and duplicated reading events.
- Add comments for assumptions, units, calibration, or non-obvious decisions. Do not document a desired behavior as though it already exists.

## Sensor processing and glucose estimation

- Keep raw ADC counts, calculated PPM, environmental measurements, reference blood glucose, and estimated glucose distinct. Temperature is Celsius, humidity is percent, and glucose utilities use mg/dL.
- The sketch averages 100 ADC samples with 10 ms delays and substitutes 25 °C/50% humidity on DHT failure. Those substitutes are fallback values, not actual measurements. Its warmup delay is 10 seconds despite a comment saying five minutes; do not infer a validated warmup protocol.
- `classifier.py` uses ADC maximum 4095, VCC 3.3, RL 10, R0 10, a temperature/humidity compensation expression, and a log-based conversion. Preserve these assumptions unless a calibration task explicitly changes them. The name `acetone_ppm` does not prove chemically selective or clinically calibrated measurement.
- Current bands are `<1.8` PPM → `Normal`, `1.8` to `<3.5` → `Pre-Diabetic`, and `>=3.5` → `Diabetic`. These are implementation thresholds, not established diagnostic criteria. Present them through existing monitoring-band labels.
- Check zero/saturated ADC, missing baseline, weak signal, non-finite inputs, and non-positive compensation when changing processing. Existing helpers are not evidence that the route validates all these cases.
- `ml_model.py` trains a single-feature Linear Regression from `backend/dataset.csv` (`acetone_ppm` → `blood_glucose`) and uses `model.pkl`; loading a missing model can trigger training. Do not call it casually during read-only inspection.
- `glucose_inference.py` is a separate optional loader for `model.pkl`. `backend/ml/` trains a three-feature bundle (`acetone_ppm`, `temperature`, `humidity` → `blood_glucose_mg_dl`) at `ml/models/glucose_regressor.joblib` and writes `metrics.json`.
- `rf_model_service.py` loads `glucose_model.pkl` and maps six gas features, substituting zero for unavailable inputs. Its prediction function does not use temperature/humidity as model features. Do not describe that mapping as validated sensor integration.
- Use consented, de-identified paired measurements for authorized model work. Document dataset provenance, feature order, units, missing-data handling, split method, and limitations. Avoid patient leakage between evaluation splits; report MAE/RMSE/R² from actual evaluation, never invented metrics. Sample templates and minimum row checks do not establish clinical validity.
- Do not silently select one model path, train on fabricated patient data, deserialize untrusted pickle/joblib files, or replace missing estimates with zero. Label any displayed result as an experimental estimate.

## Trend analysis

Both clients have `src/utils/monitoring.js`. Preserve their established behavior unless a task requests changes: trends sort chronologically, compare averages of the two halves of the latest up to seven **readings**, and classify a delta above 0.15 PPM as rising, below -0.15 as improving, otherwise stable. Fewer than two readings yield insufficient data.

The seven-day average uses a rolling time cutoff, while chart helpers show the latest up to 30 points. Seven readings are not necessarily seven days; do not repeat misleading week-based wording as a statistical guarantee. Preserve numeric values for calculations and format at display boundaries. Check empty history, invalid dates, timezone interpretation, ordering, sparse data, and threshold boundaries in authorized changes. A trend is a monitoring summary, not evidence of a diagnosis or treatment response.

## Database operations

`database.py` configures SQLite as `sqlite:///./diabetes_monitoring.db`, relative to the process working directory. The intended location is `backend/diabetes_monitoring.db`. Models are `medical_personnel`, `patients`, and `readings`; patient records link to their provider and readings link to patients. `taken_at`/`created_at` default to naive UTC timestamps.

- Use `get_db` sessions and ORM queries. Close sessions, commit deliberate writes, and roll back failed transactions when implementing error handling.
- Never delete/recreate the database, run destructive SQL, or use the real patient database for tests. Do not assume `create_all()` migrates existing tables or adds new columns.
- Schema changes require an explicit compatibility/migration plan, a restorable backup, and an authorized task. No migration framework was found.
- Preserve existing rows, foreign-key relationships, enum storage, nullability, and timestamps. Verify deletion semantics rather than assuming ORM or SQLite cascades.
- Use a separate temporary test database for integration tests and prevent import-time table creation from touching the working database. Do not import `main.py` merely to inspect route definitions.

## UI/UX guidance

For visual work, inspect the active screen and its components before editing. Preserve content, data, navigation, workflows, APIs, and functionality unless the task explicitly changes them.

- Patient mobile: preserve the light background, white rounded cards, blue navigation accents, readable typography, safe-area spacing, tab labels/icons, and shared `ScreenHeader`, reading/metric cards, loading/empty components, and `theme/colors.js`. Keep pull-to-refresh and header logout behavior consistent.
- Provider web: reuse medical sidebar, metric cards, level badges, patient detail/credential components, charts, tables, and existing Tailwind conventions. Most active pages use light content panels; layout/loading source also contains dark backgrounds. Inspect the affected page instead of imposing a uniform new theme.
- Provide visible units, timestamps, selected-patient context, and clear monitoring-band wording. Preserve green/amber/red semantics, but pair color with text. Keep experimental estimate disclaimers understandable.
- Support keyboard/focus behavior on web, accessible labels and touch targets on mobile, sufficient contrast, responsive layouts, and safe-area/keyboard handling. Do not rely on color alone.
- Show distinct loading, empty-history, error, offline, and unavailable-estimate states. Avoid displaying stale data as a new scan or diagnosing a patient from a band.

## Security, privacy, and error handling

Existing authentication uses bcrypt password hashes and HS256 JWTs with a 24-hour expiry. Web requests use a localStorage token; mobile uses AsyncStorage. These storage choices are not encrypted secret vaults. The current JWT signing key is hardcoded, CORS is permissive, sensor ingestion has no authentication dependency, and reading deletion checks medical role but does not verify that the reading belongs to that provider. These are known prototype limitations, not approved production security patterns. The OAuth2 token URL points to `/auth/login`, while actual login routes are role-specific.

- In authorized security work, enforce role and object ownership on every protected operation, including deletion and WebSocket subscriptions. Never trust a client-supplied patient ID by itself.
- Keep real credentials, WiFi secrets, signing keys, patient identifiers, tokens, database dumps, and health data out of commits, logs, screenshots, fixtures, and reports. Use synthetic/de-identified test records.
- WebSocket authentication uses a token query parameter; redact it from diagnostic URLs/logs. Do not expose a development server or database publicly to make a demo work.
- For deployment tasks, explicitly address managed secrets, HTTPS/WSS, restricted origins, device authentication, secure client token storage, and retention/access controls. These safeguards are not currently implemented merely because they are recommended here.
- Return actionable, non-sensitive errors. Log sanitized context rather than passwords or health payloads. Avoid catch-all handlers that misrepresent failed requests as successful empty results; some existing screens do this, so inspect carefully when changing them.
- Do not blindly retry sensor POSTs or destructive requests: duplicate ingestion and repeated deletion need deliberate handling. Separate successful database persistence from broadcast delivery failure.

## Running and checking the project

The commands below are verified against checked-in manifests, launch scripts, configuration, and CLI argument definitions. They were **not executed as part of creating this document**, and successful startup/build is not asserted. Use already-installed compatible runtimes/dependencies; do not install dependencies automatically. There is no root application script, backend pytest configuration, mobile test/lint script, or project-owned automated test suite found during inspection.

### Backend — PowerShell, starting at repository root

```powershell
Set-Location backend
.\venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8001
```

The existing `backend/start-server.bat` activates that environment and runs the same Uvicorn host/port. If the environment is missing or unusable, report the prerequisite rather than installing it. Startup invokes `create_all()` against the working database. Do not start the app during read-only documentation work. `setup.bat` installs dependencies and is not a verification command.

With a deliberately started development server, read-only checks are:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
Invoke-RestMethod http://127.0.0.1:8001/
```

Open `http://127.0.0.1:8001/docs` to inspect actual registered contracts. Use the role-specific JSON login endpoints rather than assuming the Swagger OAuth token URL works.

### Provider web — separate terminal, starting at repository root

```powershell
Set-Location frontend-web
npm run dev
```

Use the URL printed by Vite. Development proxies `/auth`, `/patients`, `/readings` (including WebSockets), and `/health` to backend port 8001. Production API source currently hardcodes `http://127.0.0.1:8001`; remote deployment needs an authorized configuration change.

Existing verification scripts:

```powershell
npm run lint
npm run build
```

`npm run preview` serves the built output. Build writes `dist/`; lint/build are appropriate for web changes, not required for documentation-only tasks. Record actual failures without installing/upgrading packages or fixing unrelated source automatically.

### Patient mobile — separate terminal, starting at repository root

```powershell
Set-Location frontend-mobile
npm run start:lan -- --port 8081
```

The existing default `npm start` sets Metro to port **8001**, which conflicts with the backend. The command above uses the existing LAN script with an explicit separate Metro port. Other declared scripts include `start:localhost`, `start:tunnel`, `start:clear`, `android`, `ios`, and `web`; platform/device availability still matters, especially iOS on Windows.

For a physical device, point `EXPO_PUBLIC_API_URL` at the laptop's reachable LAN address and backend port 8001, then restart Expo. It may be supplied to the current shell before launch:

```powershell
$env:EXPO_PUBLIC_API_URL = 'http://YOUR_LAPTOP_IP:8001'
npm run start:lan -- --port 8081
```

Replace the placeholder; it is not a literal host. `apiBaseUrl.js` also attempts Expo host discovery and Android emulator fallback `10.0.2.2:8001`. Loopback on a physical phone does not reach the laptop. Metro tunneling does not tunnel FastAPI.

### Optional ML commands — only for an authorized model task

From repository root, with the existing backend environment:

```powershell
Set-Location backend\ml
..\venv\Scripts\python.exe train_glucose_model.py --csv datasets/training_data.csv
..\venv\Scripts\python.exe predict_glucose.py --ppm 2.1 --temp 28 --humidity 65
```

Training requires a supplied paired dataset with the required columns and at least ten usable rows; it writes/overwrites model and metric artifacts. That minimum is a software check, not scientific sufficiency. Prediction requires a trained trusted bundle. Do not run training for routine startup, documentation, or testing against real patient data.

### Hardware and testing practice

The Arduino sketch is the firmware entry point. Compile/upload through an already-configured Arduino ESP32 toolchain with its existing DHT dependency and correct board/port; no verified repository CLI build/test command exists. Do not install board packages or flash devices automatically. Report when actual hardware evidence is unavailable. The listener polling gap must be resolved in an authorized feature task before claiming that workflow works.

For future substantive changes, add/run focused tests using tools already available or explicitly authorized. Cover ADC/compensation boundaries, band thresholds, missing models, estimate units, trend ordering/empty data, authentication and provider ownership, schema/response compatibility, transaction failures, and WebSocket filtering. Use isolated persistence and synthetic data. For UI changes, exercise login/logout, navigation, loading/empty/error states, mobile refresh, chart units, and responsive/accessibility behavior. Report baseline failures separately from regressions and keep documentation-only verification limited to source consistency and the final diff.
