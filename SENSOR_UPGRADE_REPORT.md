# BreathDX sensor upgrade — 2026-10-14

The active firmware and provider manual entry now use TGS822 as the primary
acetone-related gas input, TGS2620 as the secondary gas input, DHT22 for actual
environment measurements and ESP32 acquisition. The API stores each channel
separately. Physical calibration remains **unverified**.

## Completed changes

- Added distinct gas ADC/baseline fields, sensor configuration, calibration status
  and acquisition profile provenance to the reading model and API responses.
- Validate both required 12-bit raw gas inputs, independently optional baselines,
  finite/ranged DHT values, configuration identity and incompatible/unknown fields.
  Provider/device authentication, ownership and listener behavior are preserved.
- TGS ingestion never calls the old MQ conversion, baseline threshold or glucose
  estimator. PPM, monitoring band and glucose remain null. A typed calibration
  extension interface and optional setup identifier prepare future verified work
  without introducing calibration constants or activating existing models.
- Web manual entry collects both gas channels. Web history/dashboard/patient
  details and active patient mobile cards show raw counts and neutral unverified
  states. PPM analytics exclude raw readings, while recorded-scan history and
  exports retain them. No uncalibrated scan is displayed as a Normal band.
- Firmware samples distinct gas channels, rejects invalid/rail samples and failed
  DHT readings, and sends the new explicit contract. Configurable board pins and
  warmup must be supplied/confirmed before acquisition is enabled. WiFi retry,
  device authentication and listener-selected patient uploads are preserved.
- Applied the backed-up transactional migration to the local working database.
  All original provider, patient and reading values match the private pre-upgrade
  backup in `backend/backups/`. Integrity and foreign-key checks passed. Reading
  IDs/history are preserved, with legacy MQ labels and null TGS fields.

## MQ-138 dependencies found and their disposition

| Existing dependency | Result |
| --- | --- |
| Active sketch pin/acquisition, raw payload, local resistance/environment math and warmup messages | Replaced with separate TGS acquisition and configurable hardware settings; MQ math removed from the sketch |
| Active web Live Scan single ADC form | Replaced with primary/secondary ADC inputs |
| `Reading.raw_sensor_value`, old request `baseline_adc`, required PPM/band | Legacy fields retained; dual fields added; derived PPM/band made nullable |
| `classifier.py` MQ conversion/compensation and breath delta threshold | Retained exclusively for the explicitly identified legacy compatibility path |
| Existing concentration-based estimation service/models and standalone `ml_model.py`, `glucose_inference.py`, `rf_model_service.py`, `backend/ml/` | Preserved, not trained/deserialized during this task; not used for raw TGS input |
| Web/mobile concentration displays, analytics and badge fallbacks | Active consumers support null derived values and distinguish raw measurements from legacy history |
| Unrouted patient web pages and medical mobile screens | Inspected as inactive source; not enabled or rewritten as unrelated feature work; old payloads remain supported by the legacy compatibility path |
| MQ IoT guides and ML README assumptions | Marked legacy/reference; current contract/setup documented separately |
| Existing `.agents/skills` and architecture guide describing the previous prototype | Preserved as requested; current implementation and this report supersede their sensor-status descriptions |

Compatibility for previously deployed MQ clients is deliberate: old single-ADC
packets are labelled `mq138_legacy` and processed only by the legacy branch.
Historical values are never copied into TGS fields, recalculated or deleted.
Current TGS producers do not submit legacy fields.

## Files changed for this sensor task

Earlier review fixes were already present; this list identifies this task's files.

| Area | Files |
| --- | --- |
| Backend contract/processing | `backend/models.py`, `backend/schemas.py`, `backend/routes_readings.py`, `backend/classifier.py`, **new** `backend/sensor_processing.py` |
| Migration/startup | **new** `backend/migrate_sensor_configuration.py`, `backend/main.py`; local `backend/diabetes_monitoring.db` schema upgraded with private ignored backup |
| Backend configuration/docs | `backend/.env.example`, `backend/CONFIGURATION.md`, **new** `backend/SENSOR_CONFIGURATION.md`, `backend/ml/README.md` |
| Provider web | `frontend-web/src/pages/medical/LiveScan.jsx`, `Readings.jsx`, `Dashboard.jsx`, `Trends.jsx`; `src/components/LevelBadge.jsx`, `PatientDetailModal.jsx`; `src/utils/monitoring.js`, `exportReadings.js` |
| Patient mobile (nested repository) | `frontend-mobile/src/components/LevelBadge.js`, `PatientLatestReadingCard.js`, `PatientReadingCard.js`; `src/screens/patient/HealthTipsScreen.js`, `MyTrendScreen.js`; `src/utils/monitoring.js` |
| Firmware/docs | `iot-prototype/esp32/esp32_breathdx/esp32_breathdx.ino`; **new** `sensor_config_defaults.h`, `sensor_config.h.example`; `iot-prototype/README.md`, `MQ138-BREATH-GUIDE.md` |
| Tests/report | **new** `backend/tests/test_tgs_contracts.py`, `test_sensor_migration.py`; fixture extraction in `test_api_contracts.py`; `frontend-web/tests/monitoring.test.mjs`; `.gitignore`; **new** this report |

## Verification performed

| Check | Result |
| --- | --- |
| Backend `python -B -m unittest discover -s tests -q` | **54 passed**; isolated synthetic SQLite/app fixtures only |
| Node monitoring/export/mobile URL tests | **11 passed**, including raw TGS exclusion and unverified alerts/advice |
| Web `npm run lint` and `npm run build` | **Passed** |
| Installed Expo 57 Android export | **Passed**; no dependency upgrades/installations |
| Migration preservation and safety tests | **Passed**: backup matches original schema/data, all original values/extra columns preserved, indexes/triggers/autoincrement retained, null derived fields accepted, idempotence, refusal of partial/dependent schemas and rollback after injected failure |
| Actual local migration/post-commit comparison | **Passed**: all original columns in provider/patient/history tables match the backup; integrity/FKs passed |
| Synthetic web UI | **Passed**: provider login, separate gas inputs, saved raw values/DHT measurements, unavailable concentration/glucose, neutral unverified band, history row and PPM trend exclusion |
| Git whitespace checks | **Passed**; existing Windows line-ending notices remain |
| ESP32 compile/upload and bench operation | **Not run**: no configured Arduino CLI/PlatformIO toolchain or physical device verification available |
| Physical mobile-device UI | **Not run**; export verifies compilation/bundling, not device layout/network behavior |

Existing non-fatal passlib/bcrypt version and datetime deprecation warnings remain;
the tests completed successfully. No real model files were loaded or overwritten.
UI testing used a disposable in-memory backend, never the working patient database.

## Remaining physical work

Confirm actual board/channel assignments, analog voltage protection, power/heater
circuits, ADC operation with WiFi and the warmup/acquisition protocol. Compile and
upload using the configured board toolchain, then verify both channels, DHT failures,
saturation handling and authenticated listener uploads. Establish sensor-specific
calibration, interference/environment response and reference measurement evidence
before adding concentration, monitoring bands or a glucose model. Existing MQ
constants/models are not interchangeable with these sensors. Results remain an
experimental prototype, not a diagnosis or a replacement for validated glucose
measurements.

See [SENSOR_CONFIGURATION.md](backend/SENSOR_CONFIGURATION.md) for the exact payload,
private setup options, migration/restore procedure and calibration extension boundary.
