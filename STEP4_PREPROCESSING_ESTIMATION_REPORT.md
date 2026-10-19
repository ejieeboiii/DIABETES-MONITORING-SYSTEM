# BreathDX Step 4 — Preprocessing and estimation readiness

Implemented and checked on 2026-10-14. Step 5 has not been started.

## Outcome and scope

The dual-gas sensor acquisition now runs a versioned preprocessing pipeline before saving a reading. The backend can persist preprocessing details, calibration/profile versions, model versions and explicit estimation availability. A separate TGS Linear Regression training/inference contract is prepared for future paired **physical experimental** observations.

**No physical calibration, real-data training, clinical evaluation or model enablement was performed.** No real paired dataset was supplied, so there is no achieved glucose-model accuracy to report. Estimates remain unavailable in the current default configuration. No concentration, glucose reference value, clinical threshold or physical correction coefficient was invented. Unit-test constants and algebra/loader fixtures are isolated software tests, not experimental calibration or accuracy evidence.

TGS822 and TGS2620 are treated as distinct raw gas-sensor channels. This software does not establish acetone selectivity for either sensor and never applies the MQ-138 conversion or monitoring thresholds to them.

## Existing implementation inspected and reused

- `sensor_processing.py` already enforced the boundary between raw TGS data and unverified chemical conversion. It remains responsible for unavailable concentration/band metadata.
- `estimation_service.py` supplied opt-in, hash-pinned legacy single/three-feature inference. Its artifact integrity behaviour was retained and extended with explicit evaluation approval.
- The existing ML utilities use a single PPM feature, three PPM/environmental features, or a separate six-gas mapping. Those inputs are incompatible with dual raw TGS counts. Existing files, datasets and artifacts were preserved; none was loaded or retrained to bootstrap the new path.
- The current reading route, persistent scan transitions, acquisition receipts, provider/device authentication, patient ownership, WebSocket notification and history endpoints were reused.
- The Step 3 simulator remains separate, labelled and idempotent. It now receives preprocessing metadata but bypasses physical profiles, environmental coefficients and all glucose inference.
- Web and mobile keep their established layout, navigation and components. Only availability explanations and CSV provenance were added. The nested mobile instructions and installed project use Expo 57; the root guide's old SDK 54 reference is historical. No dependency upgrade was performed.

## Preprocessing pipeline

The implementation is `backend/tgs_preprocessing.py`, version **`tgs-adc-v1`**.

1. **Validate:** require both raw gas readings, finite temperature and humidity. Gas ADC counts are strict integers 1–4094; rails, booleans, fractional/string counts and missing readings are rejected. Temperature is −40 to 80 °C and humidity 0–100%. Optional acquired baselines are strict integers 0–4094. No temperature/humidity fallback is created.
2. **Filter available bursts:** optional `tgs822_samples_adc` and `tgs2620_samples_adc` accept 3–512 individually validated counts. Their median supplies the filtered value. All supplied counts are retained in metadata; an invalid sample rejects the input instead of being silently dropped. Original scalar ADC fields remain unchanged.
3. **Single-value behaviour:** without a burst, use the existing scalar reading and record `single_value_no_temporal_filter`. The backend cannot reconstruct noise or temporal filtering from one averaged value. Firmware averaging and backend burst median filtering are distinct operations.
4. **Resolve baselines:** use an acquired baseline first; otherwise use an explicitly configured sensor baseline if supplied. Record `acquired`, `configured` or `missing`. Missing baselines remain null. There is no automatic zero substitution or unverified baseline subtraction.
5. **Optional environmental correction:** a sensor-specific profile may supply an explicitly named linear ADC/environment correction. It requires an evidence reference and `experimentally_reviewed=true`, reference temperature/humidity, and both empirical slopes in ADC counts per °C and per humidity percentage point. No coefficients are provided by this project. Apply only within the profile's documented environmental domain; reject corrected ADC outside 1–4094 rather than clamping it.
6. **Normalize:** divide the filtered/corrected ADC and known baseline counts by **4095**, the 12-bit full-scale denominator. These are dimensionless count fractions, not concentration. DHT22 values retain their documented Celsius/percent units at this stage.
7. **Retain provenance:** store raw/filtered/corrected values, filter mode, sample count/burst, baseline source, configured sensor identifiers, feature order/units, profile SHA-256, calibration version and evidence reference. Sensor identifiers originate from the configured profile; their physical match still needs hardware verification.

The intended regression feature order is fixed:

| Feature | Unit |
| --- | --- |
| `tgs822_normalized` | Fraction of 12-bit full scale |
| `tgs2620_normalized` | Fraction of 12-bit full scale |
| `temperature_c` | °C |
| `humidity_percent` | Percent |
| `tgs822_baseline_normalized` | Fraction of 12-bit full scale |
| `tgs2620_baseline_normalized` | Fraction of 12-bit full scale |

Burst and scalar acquisition must follow the same documented experimental protocol used for training. Mathematical normalization is implemented; a validated physiological/chemical interpretation is not.

## Calibration configuration

`BREATHDX_TGS_CALIBRATION_PATH` selects an optional JSON profile. Relative paths resolve from `backend`. The profile identifies each sensor separately, records a profile ID, calibration version, acquisition protocol reference, 12-bit ADC units, temperature/humidity domain, optional baseline and optional correction evidence.

`backend/calibration/profile.unverified.example.json` is a **disabled, unverified skeleton**. It has null baselines, null correction coefficients and no experimental evidence. Its broad environmental bounds show software/DHT input limits, not a physically validated calibration domain. Do not treat placeholders as calibration evidence or enable this file as an experimentally verified profile. Future private profiles belong under `backend/calibration/private/`, which is ignored by Git.

Calibration/profile versions identify acquisition/preprocessing provenance. The existing `calibration_status=unverified` still describes unavailable gas concentration calibration, even if a future evaluated raw-feature glucose model is enabled. No chemical concentration adapter was activated.

## Linear Regression training and evaluation readiness

The new entry point is `backend/ml/train_tgs_regression.py`, invoked from `backend` as `python -m ml.train_tgs_regression`. It uses installed pandas, NumPy and scikit-learn components: `GroupShuffleSplit`, training-only `StandardScaler` and `LinearRegression`.

Required inputs are an explicit CSV, dataset manifest, reviewed sensor profile, new output path and model version. There is no default clinical dataset, automatic startup training or artifact overwrite.

The CSV header is provided in `backend/ml/datasets/tgs_paired_template.csv`. It contains **no measurement rows**. Required columns cover both raw ADC values, both baselines, environment, recorded reference glucose in mg/dL, stable de-identified participant IDs, unique acquisition UUIDs, device ID, sensor/reference timestamps, simulation/origin labels, both sensor identifiers, calibration version, profile hash and preprocessing version.

Validation rejects incomplete/non-finite/invalid observations, duplicate acquisitions (including equivalent UUID spellings), unknown/simulated origin, simulator/manual device identities, incompatible units/profiles/versions, missing reviewed provenance and references outside the explicitly documented pairing interval. No rows are silently dropped and no values are imputed. Dataset declarations and hashes cannot prove truthful provenance or consent; experimental records must be reviewed by the project team before use.

The manifest requires:

- `dataset_version`;
- `origin: "physical_experimental"` and `contains_simulated: false`;
- `consent_and_deidentification_reviewed: true`;
- real `evidence_reference` and `reference_measurement_method`;
- `target_unit: "mg/dL"`;
- protocol-supported `max_pairing_seconds`.

The software requires at least ten complete rows, at least three participant groups, at least eight training observations and two held-out observations, with target variation for R². These are software minima, **not scientific sufficiency**. The held-out group fraction is 25% with seed 42. Participant groups cannot overlap between training and holdout. Scaling means/stds are fitted on training observations only. Reported metrics are actual held-out **MAE (mg/dL), RMSE (mg/dL), and R²**, with counts and split details.

The exported `breathdx-tgs-linear-v1` JSON artifact includes coefficients/intercept, scaling parameters, exact feature order/units, training-domain bounds, preprocessing/calibration/model versions, profile hash, dataset/manifest hashes, provenance and evaluation metrics. Coefficients operate on standardized features. JSON avoids executable pickle/joblib deserialization for the TGS path. The trainer refuses an existing output file and returns the SHA-256 of the actual bytes written.

No real dataset was fitted. The training CLI's argument/help path was executed successfully; real-data training, holdout results and scientific suitability remain unverified until suitable data exists. Metric-calculation tests verify arithmetic only. Existing legacy sample files are not evidence for this TGS model.

## Runtime estimation controls

The implementation is `backend/tgs_estimation.py`. The backend's existing authenticated `/readings/sensor` route invokes it after TGS preprocessing for device acquisitions.

Estimation requires all of the following:

- non-simulated, device-authenticated acquisition;
- a profile with experimental evidence reference and complete model features;
- `BREATHDX_TGS_MODEL_ENABLED=true` explicitly selected;
- a selected JSON artifact path, exact SHA-256 and approved model version;
- explicit project-reviewed evaluation criteria (`max_mae_mg_dl`, `max_rmse_mg_dl`, `min_r2`), with **no invented/default accuracy thresholds**;
- valid physical-data provenance declarations, participant holdout metadata and finite metrics meeting those criteria;
- matching preprocessing version, feature order/units, calibration version and profile hash;
- input within the training domain and a finite positive model result, including after display rounding.

Disabled, missing, corrupt, incompatible, unevaluated, out-of-domain or incomplete model inputs return `predicted_bgl=null`, `estimation_status=unavailable`, and an explanatory reason. Valid raw readings are still saved if model loading/inference is unavailable. A bad calibration configuration produces a sanitized 503 without saving a reading; invalid measurements/profile-domain violations produce 422.

Provider manual entries are still saved and preprocessed but cannot activate the new glucose estimator (`manual_entry_not_verified`). Simulations always return `simulated_data`, bypass physical calibration entirely and never load a model, even when model settings are enabled.

An enabled compatible model returns `available_experimental` with its model version. It does **not** generate gas concentration or monitoring bands, and the UI labels it as experimental and not medically validated. No glucose-based classification, therapeutic advice or clipping to an invented clinical range was introduced.

The legacy PPM inference service now additionally requires hash-pinned evaluation metadata tied to its selected model SHA/mode/version and explicit acceptance criteria. Existing single/three-feature artifacts alone are insufficient. New settings are documented in `backend/.env.example`; legacy research helper scripts remain separate and are not approved TGS entry points.

## Persistence, compatibility and migration

The reading API adds nullable `preprocessing_version`, `preprocessing_metadata`, `calibration_version`, `model_version`, `estimation_status`, and `estimation_reason`. REST history/latest responses and live reading notifications carry these same values. CSV exports include the version/availability fields. Historical metadata is left null; it was not fabricated or backfilled.

`migrate_preprocessing.py` adds only these six nullable columns. It creates an exclusive private backup, verifies every original table's values/counts before committing, preserves indexes/relationships, rejects partial schemas and is idempotent. Startup checks explicitly require the migration instead of relying on `create_all()`.

The migration **was applied to this checkout**. After commit, a separate read-only comparison against its private backup confirmed all original rows/values, integrity and foreign-key checks. Existing patients, MQ-138 history, raw TGS readings, scans, receipts and simulation state were preserved. No test reading or training record was added to the working database.

Receipt fingerprinting excludes the new optional burst fields when absent, preserving Step 2/3 canonical hashes and replay compatibility. Existing paths, ownership/authentication, IDs, duplicate prevention and terminal-session protections remain unchanged.

## Modified files for Step 4

| Area | Files |
| --- | --- |
| Processing/inference | `backend/tgs_preprocessing.py`, `backend/tgs_estimation.py`, `backend/estimation_service.py`, `backend/routes_readings.py` |
| API/persistence | `backend/schemas.py`, `backend/models.py`, `backend/main.py`, `backend/migrate_preprocessing.py`, `backend/diabetes_monitoring.db` |
| Calibration/settings | `backend/calibration/profile.unverified.example.json`, `backend/.env.example`, `.gitignore` |
| Training preparation | `backend/ml/train_tgs_regression.py`, `backend/ml/datasets/tgs_paired_template.csv`, `backend/ml/README.md` |
| Backend tests | `backend/tests/test_tgs_preprocessing.py`, `backend/tests/test_preprocessing_api.py`, `backend/tests/test_preprocessing_migration.py`, `backend/tests/test_estimation_service.py`, `backend/tests/check_step4_integration.py` |
| Provider client | `frontend-web/src/utils/estimation.js`, `frontend-web/src/utils/exportReadings.js`, `frontend-web/src/pages/medical/LiveScan.jsx`, `frontend-web/src/pages/medical/Readings.jsx` |
| Patient client | `frontend-mobile/src/utils/estimation.js`, `frontend-mobile/src/components/PatientReadingCard.js`, `frontend-mobile/src/components/PatientLatestReadingCard.js` |
| Client tests | `frontend-web/tests/monitoring.test.mjs`, `frontend-web/tests/mobile-api.integration.mjs` |
| Report | `STEP4_PREPROCESSING_ESTIMATION_REPORT.md` |

Pre-existing Step 1/2/3 and review changes were preserved. Firmware, lockfiles, installed dependencies, historical artifacts and the nested mobile repository were not reset or upgraded.

## Actual test results

| Check | Result |
| --- | --- |
| Complete isolated backend suite | **120 tests passed**, including 21 new Step 4 tests and all 99 prior tests |
| Client utilities/CSV/availability suite | **16 tests passed**, covering both web and mobile |
| Provider web lint | Passed |
| Provider production build | Passed, 661 modules compiled |
| Mobile Android export | Passed, 2,962 modules compiled; Android Hermes bundle/assets emitted |
| Training CLI `--help` | Passed using installed dependencies; no fit/data loading occurred |
| Disposable backend live integration | Passed: full simulation, persisted preprocessing, unavailable estimates, duplicate prevention and authenticated patient retrieval |
| Actual mobile API helper integration | Passed against the disposable backend, including new metadata, simulation provenance and unavailable status |
| Migration preservation | Passed in isolated fixtures and working-database post-commit read-only verification |
| Root/nested-mobile whitespace checks | Passed; existing LF/CRLF notices only |

Tests cover median filtering, normalization, scalar/no-filter behaviour, missing/invalid environmental values and bursts, baseline configuration, sensor/profile compatibility, environmental evidence gates, simulation bypass, disabled/missing/corrupt models, hashes, feature order, preprocessing version, evaluation criteria, prediction domain/output, metric arithmetic, manifest rejection, API persistence, receipt compatibility and migration rollback/preservation.

Software test artifacts use deliberately labelled unit-only profile/model attestations and mocked artifact bytes. They were never trained from synthetic clinical observations, enabled in the private runtime configuration, or represented as real-world evaluation results.

Existing passlib/bcrypt version-reporting and UTC deprecation warnings remain non-fatal. Fault-injection tests deliberately log storage/notification/model failures. Vite/Expo also emitted non-fatal performance/environment warnings. Dependencies were not changed to suppress these unrelated warnings.

## Local checks without hardware or experimental data

Start PowerShell at `C:\Users\Kian\Diabetes-Monitoring-System`. Use the existing environments.

### Backend tests

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\backend
.\venv\Scripts\python.exe -B -m unittest discover -s tests -q
.\venv\Scripts\python.exe -B -m ml.train_tgs_regression --help
```

### Full disposable integration

Terminal 1:

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\backend
.\venv\Scripts\python.exe -B -m uvicorn ui_fixture:app --app-dir tests --host 127.0.0.1 --port 8012 --no-access-log
```

Terminal 2:

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\backend
.\venv\Scripts\python.exe -B tests/check_step4_integration.py
Set-Location ..\frontend-web
node tests/mobile-api.integration.mjs
```

These checks are hard-bound to the disposable loopback fixture and synthetic test accounts; they do not load `main.py` or access the patient database. The simulation check creates one synthetic reading per invocation and confirms that replay adds none. Stop the fixture with Ctrl+C afterward.

For provider browser testing, use the Step 3 report's Vite proxy instructions with `BREATHDX_BACKEND_URL=http://127.0.0.1:8012`, sign in using its synthetic fixture account, and run Live Scan → Simulation. Inspect the new preprocessing/status fields in patient history through the fixture/API; the UI should show unavailable experimental glucose without changing its layout.

### Client checks

```powershell
Set-Location C:\Users\Kian\Diabetes-Monitoring-System\frontend-web
node --test tests/monitoring.test.mjs
npm run lint
npm run build
Set-Location ..\frontend-mobile
node node_modules/expo/bin/cli export --platform android --output-dir ../output/mobile-step4-check
```

### Existing database setup elsewhere

This checkout is migrated. For a different Step 3 database, stop the API and other writers, retain private backups, then run from `backend`:

```powershell
.\venv\Scripts\python.exe -B migrate_preprocessing.py
```

Run the normal API from `backend` as before. Keep all model-enabled settings false/disabled for routine testing. No model artifact is required to save and preprocess valid readings.

## Future real-data training and activation

This is a preparation procedure, **not an instruction to manufacture or train on test values**. Do not run training until consented, de-identified, reviewed paired physical data and protocol evidence exist.

1. Establish the physical sensor identifiers, ADC/circuit configuration, acquisition/warmup/sampling protocol, environmental domain, observed baselines, and any experimentally supported correction. Record the profile/version and evidence. Chemical selectivity and concentration calibration require separate evidence.
2. Capture valid physical acquisitions, reference method/units, paired timestamps, stable de-identified participant IDs and acquisition UUIDs. Existing `taken_at` is a persistence timestamp; it is not proof of the actual breath-capture/reference pairing time.
3. Populate a private CSV using the header contract, with true `physical_experimental` provenance and `is_simulated=false`. Review each record's profile/sensor/version linkage. Do not relabel simulator or unknown-origin rows as physical data.
4. Prepare the reviewed dataset manifest. Supply a protocol-supported pairing interval; this software supplies no medical timing or accuracy threshold.
5. From `backend`, use the following command only with those real files:

```powershell
.\venv\Scripts\python.exe -B -m ml.train_tgs_regression --csv ml/private/paired.csv --manifest ml/private/manifest.json --profile calibration/private/profile.json --output ml/private/reviewed-model.json --model-version YOUR_REVIEWED_MODEL_VERSION
```

6. Review actual holdout metrics, sample/group coverage, acquisition consistency, leakage risks, and generalization limits. The CSV/manifest hashes and profile digest in the artifact bind its declared provenance; human review is still required.
7. Only after review, explicitly configure the private `BREATHDX_TGS_CALIBRATION_PATH`, `BREATHDX_TGS_MODEL_PATH`, actual artifact SHA-256, matching model version, and project-approved evaluation criteria JSON. Set `BREATHDX_TGS_MODEL_ENABLED=true` only when authorized. Nothing in training automatically changes these settings.
8. Recheck physical device ingestion, out-of-domain and missing-feature behaviour, saved versions/statuses, patient ownership, and rendered web/mobile results. If the profile changes, review/retrain/re-evaluate the matching model rather than silently reusing it.

`backend/.env.example` lists the settings without supplying fabricated model versions, coefficients or acceptance thresholds. Private datasets/profiles/artifacts should remain in the ignored private directories and outside logs/commits.

## Remaining physical and scientific requirements

- Physical ESP32/TGS/DHT acquisition, wiring, sensor identities, warmup/stability and actual noise characteristics remain unverified. No hardware was flashed or calibrated.
- No physical correction coefficients, calibrated concentration outputs, reference dataset, trained TGS model or achieved MAE/RMSE/R² is available from this work.
- A documented, representative paired study and independently reviewed evaluation are still required. The software minima and one participant holdout split do not establish scientific sufficiency or medical validity.
- Sensor/profile evidence, consent and dataset declarations are not automatically authenticated scientific facts. They require accountable experimental review.
- Physical patient mobile runtime, touch/refresh behaviour and LAN connectivity remain unverified. API helpers, shared availability logic and Android export were checked; no phone/emulator was used.
- Existing legacy research utilities remain separate. Their old feature mappings, artifacts and thresholds are not substituted into the TGS pipeline.
- No Step 5 work, UI redesign, new service or framework installation was performed.
