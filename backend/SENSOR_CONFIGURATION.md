# Dual TGS sensor configuration

Step 2 extends this sensor contract with scan/acquisition IDs and durable session
completion. Device uploads must include both IDs. See
[SCAN_WORKFLOW.md](SCAN_WORKFLOW.md) for the current lifecycle/retry contract and
the additional additive schema migration. Older identifier-free manual requests
remain compatible; their retry protection requires supplying an acquisition ID.

The active acquisition configuration is ESP32 + TGS822 (primary acetone-related
gas input) + TGS2620 (secondary gas input) + DHT22. Each gas channel is stored
independently as **raw 12-bit ADC counts**, not concentration or glucose.

## Request and response

`POST /readings/sensor` retains provider Bearer authentication for manual input
and `X-Device-Key` authentication for the configured device/provider. Device
submissions still require a matching armed listener patient. Example synthetic
payload (patient must belong to the authenticated provider):

```json
{
  "patient_id": 1,
  "sensor_configuration": "tgs822_tgs2620",
  "tgs822_raw_adc": 1200,
  "tgs2620_raw_adc": 1500,
  "tgs822_baseline_adc": 900,
  "tgs2620_baseline_adc": 1000,
  "temperature": 28.5,
  "humidity": 65.0
}
```

Both gas readings are required integers 1–4094; zero and saturation are rejected.
Optional, independently observed baselines are integers 0–4094. Temperature is
finite Celsius −40–80; humidity is finite percent 0–100. Missing/failed DHT samples
are rejected/skipped, never replaced with guessed environment values. Unknown
fields, client-supplied derived values and mixed MQ/TGS fields are rejected.
Baselines are stored without applying the old MQ subtraction/rise threshold:
the TGS response direction and meaningful breath threshold require physical work.

The response, REST history and `reading_created` WebSocket event include these
fields and `calibration_status: "unverified"`. `acetone_ppm`, `diabetes_level` and
`predicted_bgl` are **null** for new TGS readings. The event shape and existing
auth/ownership/session behavior are preserved; clients now support nullable
derived values. The web manual form submits both channels. Both clients display
raw counts and a neutral unavailable band. PPM charts/averages omit raw readings;
raw readings still count as recorded scans and remain visible in history/export.

## Calibration boundary

`sensor_processing.py` defines typed `TGSCalibrationInputs` and a
`TGSCalibrationAdapter` extension interface. No adapter is registered, no TGS
conversion formula is supplied, and no existing glucose model is invoked for raw
TGS input. `BREATHDX_TGS_PROFILE_ID` can record an acquisition setup identifier
(1–100 letters/digits/dots/underscores/hyphens); it does **not** enable calibration.
The identifier is saved in `calibration_profile_id`. Changing the identifier
never rewrites history.

Before implementing an adapter, supply measured calibration evidence identifying
each physical sensor, analog circuit/load resistor, ADC settings/reference,
baseline protocol, response direction, reference gas/concentration, environmental
domain and interference limitations. Verify units and out-of-domain behavior.
Existing MQ conversion constants, compensation, 50-count breath threshold,
prototype monitoring bands, single/three-feature regressors and six-gas Random
Forest mappings are not approved TGS calibration or model inputs. No models were
trained or artifacts replaced for this change. Further model/band integration
requires separately reviewed evidence; sensor data alone does not diagnose diabetes.

## Safe SQLite upgrade

Stop the API and other database writers first. From `backend`:

```powershell
.\venv\Scripts\python.exe -B migrate_sensor_configuration.py
```

Optional `--source` and `--backup` select a database and a **new** private backup
file. Default source is anchored to `backend/diabetes_monitoring.db`; backups go
under ignored `backend/backups/`. Do not commit/share backups or health data.

The migration takes a reserved write lock, integrity/FK-checks the source, creates
a consistent SQLite backup and integrity-checks it before changes. In one
transaction it adds seven sensor/provenance columns and rebuilds `readings` to
allow absent concentration and band. It copies and compares **every column and
row** before replacement, restores indexes/triggers/autoincrement sequence, and
checks final integrity/FKs before committing. Patient/provider tables are not
rewritten. Extra legacy columns are preserved. Partial schemas and unknown tables
referencing readings are refused for manual compatibility review. Failure rolls
back schema/data changes and retains any completed backup. A second run is a no-op.

All existing reading IDs, timestamps, ADC, PPM, bands, suggestions and glucose
values remain intact. Existing rows gain `sensor_configuration: "mq138_legacy"`
and `calibration_status: "legacy_unverified"`; TGS columns remain null. Historical
data is never renamed or recalculated. To restore, stop every writer and restore
the verified backup privately along with the matching pre-migration application
version. Never restore over a running SQLite server or ignore WAL/journal files.
The API checks schema compatibility at startup rather than silently migrating.

Old payloads containing only `raw_sensor_value`/`baseline_adc` retain a **legacy
compatibility path** (or explicitly specify `mq138_legacy`). Only that path calls
`classifier.py` and the optional legacy estimator. This preserves previously
deployed clients without treating MQ data as TGS measurements. New manual inputs
and firmware use the dual configuration by default. Old guides and standalone
ML training data remain archived/reference material, not active TGS acquisition.

## Firmware setup and physical verification

Active sketch: `iot-prototype/esp32/esp32_breathdx/esp32_breathdx.ino`.
Copy `sensor_config.h.example` to ignored `sensor_config.h`, supply verified gas
ADC and DHT pins, confirm wiring, and set a nonzero warmup duration justified by
your acquisition protocol. Unconfigured settings disable acquisition. Configure
the existing private device authentication header separately.

Confirm board-specific ADC/WiFi compatibility, input protection and power/heater
circuits against manufacturer specifications. No wiring voltage, load resistor,
conversion constants or validated warmup duration is invented here. Step 6 firmware
now acquires stable per-channel baseline medians, waits for configurable consecutive
ADC changes and captures distinct sample bursts with actual DHT22 values. The
software defaults (32 baseline samples, 64 capture samples, 20 ms nominal sample
interval) are unverified acquisition settings. Detection delta/polarity and baseline
quality limits require an experimental protocol; default settings disable capture.
Raw medians, baselines and sample arrays use the existing API schema. A durable
outbox recovers the same payload/IDs through authenticated acquisition receipts.
See [Step 6 instructions and verification limits](../STEP6_IOT_INTEGRATION_REPORT.md).

Required remaining evidence: compile for the exact physical board and upload only
after electrical checks; verify physical pin identities and independent ADC signals, heating
stability, DHT behavior, saturation/error handling, listener/upload operation and
physical calibration. Software tests with synthetic inputs do not establish
sensor accuracy, selectivity or clinical validity.
