# Step 5 — Web and mobile integration verification

Verification completed on 2026-10-14. Step 6 has not been started.

## Scope and preserved work

The existing working tree already contained Steps 1–4 and part of Step 5. Those changes were inspected and retained, including the nested mobile Git repository. Existing authentication, patient/account screens, reading APIs, persistent scans, simulation, preprocessing and estimation safeguards were reused. No dependency installations, framework upgrades, new services, model training or UI redesign were performed.

All account/scan mutations during this verification used synthetic disposable accounts and the **in-memory SQLite fixture** in `backend/tests/ui_fixture.py`, served only on `127.0.0.1:8012`. It does not import `main.py`, use the working patient database or load the configured patient-facing model artifact. Unit tests use separate isolated databases. The working `backend/diabetes_monitoring.db`, existing migrations, hardware configuration and model artifacts were not changed by Step 5. Their earlier uncommitted changes remain in the working tree. No Step 5 database migration is necessary.

## Implemented integration fixes

- Mobile Dashboard, Results, Trend and Tips now refresh readings and patient profile information when focused. Focused screens also refresh when the app returns to the foreground. Blur/unmount invalidates outstanding reading requests; newer responses win over older requests. Pull-to-refresh remains available on the existing refreshable screens.
- Mobile profile updates/refreshes are scoped to the current token and request sequence. A late response cannot replace a later edit or restore a signed-out patient's profile. Navigation stacks are keyed by patient identity, preventing navigation state from being reused across patients.
- Provider data refreshes when a visible browser page receives focus or becomes visible. Event listeners are removed on unmount. Newer requests win; failed refreshes preserve the prior data and expose a retry error instead of pretending history is empty.
- Web and mobile history pagination clamps the requested page when results shrink or become empty. Previous/next use the displayed page. Web reading deletion refreshes history and returns to page 1. Mobile pagination controls wrap and retain usable touch targets.
- Successful provider/patient password changes immediately sign out the current client. Failed changes do not sign out. The existing backend invalidates old JWTs through credential versioning; clients show a sign-in message. Ordinary logout clears client state/storage; it does not introduce server-side JWT revocation.
- Login credential errors are distinguished from expired protected sessions, offline/network failures, forbidden access, validation errors and unavailable storage. Patient password-reset errors use the shared formatter, avoiding rendering validation arrays directly as React children.
- Account/patient database failures return sanitized 503 responses. Patient creation validates trimmed names, bounded field lengths and integer ages from 0 through 130. Web creation inputs match the password/age limits.
- Synthetic records remain in history and exports with explicit simulation labels. They cannot contribute to concentration charts, monitoring bands, trend averages or medical alerts. The no-data alert now says **“No real sensor readings recorded yet”**. An empty review queue no longer claims that patients are medically stable.
- Simulation and uncalibrated TGS records retain unavailable concentration, band and glucose values. No glucose predictions, calibration coefficients, reference measurements or medical interpretations were fabricated.

## Modified files for Step 5

This list identifies the Step 5 work, not every pre-existing Git modification from earlier steps.

| Area | Files and purpose |
| --- | --- |
| Backend | `backend/schemas.py` — patient/provider validation; `backend/routes_auth.py`, `backend/routes_patients.py` — sanitized account database errors, existing account/patient integration |
| Backend verification | `backend/tests/test_step5_accounts.py` — account/patient/password/ownership/error regressions; `backend/tests/ui_fixture.py` — aggregate association check supports multiple disposable providers |
| Provider web | `frontend-web/src/hooks/useProviderData.js` — activation refresh and request guards; `frontend-web/src/pages/medical/Account.jsx` — password-change sign-out; `frontend-web/src/pages/medical/Readings.jsx` — bounded pagination; `frontend-web/src/pages/medical/Patients.jsx` — creation input constraints; `frontend-web/src/components/PatientDetailModal.jsx` — formatted reset errors |
| Web shared utilities/display | `frontend-web/src/utils/pagination.js`, `frontend-web/src/utils/errors.js`, `frontend-web/src/utils/monitoring.js`, `frontend-web/src/pages/medical/Dashboard.jsx` |
| Patient mobile | `frontend-mobile/src/hooks/usePatientReadings.js`, `frontend-mobile/src/context/AuthContext.js`, `frontend-mobile/src/navigation/AppNavigator.js`, `frontend-mobile/src/screens/patient/AccountScreen.js`, `frontend-mobile/src/screens/patient/MyResultsScreen.js` |
| Mobile shared utilities | `frontend-mobile/src/utils/pagination.js`, `frontend-mobile/src/utils/errors.js`, `frontend-mobile/src/utils/monitoring.js` |
| Client verification | `frontend-web/tests/integration.test.mjs`, `frontend-web/tests/monitoring.test.mjs`, `frontend-web/tests/step5-api.integration.mjs`, `frontend-web/tests/step5-history.integration.mjs` |
| Report | `STEP5_WEB_MOBILE_INTEGRATION_REPORT.md` |

## Actual test results

| Check | Result |
| --- | --- |
| Backend unittest discovery | **128 tests passed**, including 8 Step 5 account/patient integration tests and prior scan, simulation, preprocessing, estimation, migration and authorization regressions |
| Client Node tests | **29 tests passed**: monitoring/CSV/URL checks plus refresh lifecycle, stale responses, profile races, pagination, error recovery and successful/failed password-change handlers |
| Actual web + mobile Axios helpers against fixture | **Passed**: provider registration/login, patient creation/editing, patient profile synchronization, ownership/role denial, empty/latest retrieval, complete scan, repeated submission, service interruption/recovery, deletion without re-creation, old-password/JWT invalidation and unauthenticated denial |
| Browser-created patient and reading → actual mobile API helpers | **Passed**: edited patient profile, latest reading and full history agree with provider responses; 21 completed synthetic scans had 21 unique acquisition IDs and session IDs |
| Web ESLint | **Passed**, zero errors/warnings after the refresh cleanup fix |
| Web production build | **Passed**, Vite built 662 modules |
| Expo Android export | **Passed**, SDK 57 / Metro bundled 2,963 modules and generated a Hermes Android bundle plus metadata under `output/mobile-step5-check` |
| Root and nested-mobile Git whitespace checks | **Passed** |

The lifecycle/account handler tests execute the actual source with controlled hooks, lifecycle events, storage and transport adapters. They verify asynchronous behavior and sign-out order; they are **not React Native renderer or physical-phone UI tests**. The live integration scripts use actual Axios interceptors/helpers and real HTTP responses from the fixture. They mock only native storage/base URL for the mobile API module.

During test development, incorrect test payloads omitted required edit/profile fields and one assertion expected a deleted completed simulation to return 410. These test assumptions were corrected to match the preserved API contract: a completed simulation returns its terminal state with `reading: null` after deletion and does not recreate the record. The final checks passed.

Non-failing existing diagnostics: passlib reports missing `bcrypt.__about__` while password hashing/login tests pass; Python reports naive-UTC deprecation warnings; intentional backend fault tests log sanitized failures; Metro reports a `NO_COLOR`/`FORCE_COLOR` warning. Dependencies were not changed to silence these messages.

## Browser verification results

The existing provider application was served at `http://127.0.0.1:5179` through its Vite proxy to the disposable fixture. Tests used the in-app Chromium browser and real UI controls.

| Flow | Observed result |
| --- | --- |
| Login and failure recovery | Wrong test password displayed “Invalid email or password”; valid credentials opened the provider dashboard |
| Registration/account isolation | A new disposable provider registered and saw zero patients/readings, without the other provider's data |
| Logout/protected navigation | Account Sign out returned to login; opening `/medical/readings` while signed out redirected to login |
| Patient creation | Created a disposable patient, dismissed the one-time credentials banner, and opened the patient details modal |
| Editing | Changed the patient's name/contact; the patient list and modal updated, and actual mobile profile retrieval matched |
| Patient-context navigation | Patient details → Live scan preserved `?patient=2` and selected the edited patient after patient loading |
| Complete simulated scan | Start Test → Instructions → Continue → Waiting → automatic detection/capture/processing → Completed at 100%; result saved to history with explicit synthetic labels and unavailable medical fields |
| History/filtering | Synthetic record appeared in history; selecting a patient with no readings showed zero records and disabled export; selecting the edited patient showed their history |
| Multi-page deletion | 21 synthetic readings produced two pages; deleting the only record on page 2 left 20 readings on a valid first page with no empty out-of-range page |
| CSV download | Actual Export button downloaded CSV; inspected contents included patient name, raw ADC/environment/baselines, simulation provenance and preprocessing/estimation status, with blank concentration/glucose/model/calibration values |
| Dashboard/trends | Dashboard recent readings explicitly labeled synthetic records; band counts stayed zero; Trends had zero band counts and no concentration chart despite synthetic history |
| Provider profile | Saving profession displayed “Profile saved” in Account |
| Service/session recovery | Injected fixture 503 displayed Retry; reload displayed session-restoration Retry/Sign out; restoring service and Retry recovered the provider session without re-entering credentials |
| Narrow layout | At 390 × 844, dashboard navigation/content remained usable; document width equaled viewport width (390), with no page-wide horizontal overflow. Desktop sizing was restored |

Saved browser evidence: `output/step5-integration.png` (synthetic reading history after deletion/filtering). Browser screenshots contain only disposable test information. A native confirmation dialog delayed the automation click during deletion; accepting the existing dialog completed the deletion, and the UI/database result was verified.

Browser focus/visibility event behavior is covered by the controlled lifecycle regression tests. The browser checks above verify navigation/reload/error recovery, not an OS-level background/foreground automation claim. Mobile password changes were verified through backend/API tests and the actual screen-handler tests; password entry/submission was not automated through a browser UI.

## Remaining limitations and unverified checks

- **Physical-phone testing is unverified.** No Android/iOS device, emulator UI, touch navigation, native tab transitions, operating-system suspension, phone pull-to-refresh, keyboard/safe-area layout, or physical-phone offline/resume test was performed. Android export establishes compilation, not installed-app correctness.
- The mobile reading components and active navigation were inspected; synthetic/unavailable labels are covered by shared utility tests and data contracts. Their visual rendering on a real phone remains unverified.
- Patient individual results remain the existing detailed reading cards in Results/history. No unrelated new results screen or navigation design was introduced.
- Sensor simulation has scripted breath detection and synthetic raw/environment values. ESP32 connectivity, physical breath detection, ADC wiring/ranges, DHT accuracy, calibration and real acquisition interruptions still require hardware testing.
- No experimental paired dataset/model accuracy or medical validation was established. Estimation remains unavailable without the explicitly enabled, integrity-checked and evaluated model required by Step 4. Synthetic readings are not accuracy evidence or training/evaluation data.
- Client logout clears local credentials; already-issued JWTs are not independently revoked by ordinary logout. Password changes invalidate prior credentials/tokens. Existing localStorage/AsyncStorage security limitations remain relevant before deployment.
- The disposable test fixture's fault controls are test-only and are not registered in the production application. It must remain loopback-only.
- Root guide/older skills contain historical architecture statements; current source and the mobile SDK 57 manifest were used. The nested mobile guide now references SDK 57 rather than the root guide's stale SDK 54 note.

## Local verification instructions

Use existing installed dependencies. Run commands from the stated folders. Do not seed or reset the working patient database for tests.

### Automated checks

From `backend`:

```powershell
.\venv\Scripts\python.exe -B -m unittest discover -s tests -q
```

From `frontend-web`:

```powershell
node --test tests/monitoring.test.mjs tests/integration.test.mjs
npm run lint
npm run build
```

From `frontend-mobile`:

```powershell
node node_modules/expo/bin/cli export --platform android --output-dir ../output/mobile-step5-check
```

### Disposable web/backend integration

Terminal 1, from `backend`:

```powershell
.\venv\Scripts\python.exe -B -m uvicorn ui_fixture:app --app-dir tests --host 127.0.0.1 --port 8012 --no-access-log
```

Terminal 2, from `frontend-web`:

```powershell
$env:BREATHDX_BACKEND_URL = 'http://127.0.0.1:8012'
npm run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Open `http://127.0.0.1:5179`. The fixture's disposable provider is `demo@example.com`; its existing patient is `patient@example.com`. Both use the **test-only password** `Test-Only-Password`.

1. Sign in as the demo provider. Create a patient named `Browser Test Patient`, email `browser-patient@example.com`, age 32, with the same test-only password. Dismiss the credentials banner. Edit the name to `Edited Browser Patient` and optionally contact details.
2. Open patient details → Live scan → Simulation. Confirm the selected test patient, Start Test and Continue. Observe completion and synthetic/unavailable labels. Open Readings, filter patients, export CSV and inspect provenance/blank medical columns. Dashboard/Trends must not interpret synthetic records as real measurements.
3. From `frontend-web`, run `node tests/step5-api.integration.mjs`. This creates its own unique disposable accounts and verifies both actual API clients, including credential changes. It never changes the demo/browser account passwords.
4. Run `node tests/step5-history.integration.mjs` after completing the browser scan. It verifies actual mobile retrieval for the browser patient and fills that patient's history to 21 completed synthetic scans through the real API. Revisit Readings, go to page 2 and delete its only disposable record. Verify 20 readings on page 1. The script expects the browser-created patient and at least one completed scan.
5. For browser recovery testing, from a separate PowerShell terminal use the test-only controls below, restore service, then click Retry. Reload while unavailable to check session restoration. Always restore the fixture before continuing.

```powershell
Invoke-RestMethod -Method Post 'http://127.0.0.1:8012/__test/unavailable?enabled=true'
# Inspect the browser's retry state, then restore:
Invoke-RestMethod -Method Post 'http://127.0.0.1:8012/__test/unavailable?enabled=false'
```

Stop both test servers with Ctrl+C when finished. Restarting the fixture discards its disposable in-memory data. Remove the shell's test proxy override before normal development (`Remove-Item Env:BREATHDX_BACKEND_URL`), or use a new terminal.

### Patient mobile runtime verification still to perform

For an available Android emulator using the disposable fixture, from `frontend-mobile`:

```powershell
$env:EXPO_PUBLIC_API_URL = 'http://10.0.2.2:8012'
npm run start:lan -- --port 8081
```

Use a compatible installed development build/runtime for this repository's Expo SDK 57. Sign in with the disposable browser patient after creating its scans. Verify Dashboard latest reading, Results details/history, Trend exclusion, Account, logout, invalid login, pull-to-refresh, switching tabs after a provider edit/new scan, app background/foreground, offline/retry and password-change sign-out. Check synthetic labels and unavailable measurements on the actual device UI. These instructions have **not** been executed on an emulator/phone.

A physical phone cannot reach the laptop fixture through loopback or emulator address `10.0.2.2`. Use an explicitly configured private development API reachable by the phone (or an existing USB forwarding setup) and a separate disposable database; do not expose this test fixture publicly. For normal local development, the existing backend runs on port 8001 and Expo should run on 8081. Set `EXPO_PUBLIC_API_URL` to the reachable private development API address and restart Expo after changes. No physical connectivity or device correctness is asserted by this report.
