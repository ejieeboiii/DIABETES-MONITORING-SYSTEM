# Step 6 — ESP32 and IoT integration readiness

Date: 2026-10-14. Step 7 has not been started.

## Completed software preparation

The existing dual-sensor firmware and backend device/scan endpoints were inspected. Existing Steps 1–5, database records/migrations, frontend behavior, simulation and estimation safeguards were preserved. No production database, model artifact, patient account or physical device was modified. No dependencies were installed and no device was flashed.

The active Arduino sketch now supports **TGS822 (primary acetone-related gas input), TGS2620 (secondary gas input), DHT22 and ESP32**. Neither gas sensor is asserted to be acetone-specific. The active sketch contains no MQ-138 acquisition fields, conversion formulas, glucose predictions or monitoring bands. Historical backend MQ-138 compatibility and the archived MQ guide remain intact.

### Firmware changes

- Replaced the previous one-burst upload loop with warmup → idle → paired baseline → waiting for configured ADC change → capture → durable upload/recovery stages.
- Configurable distinct GPIOs, 12-bit ADC acquisition, attenuation, sample counts/intervals, warmup, quality spans, detection polarity/delta/AND-or-OR rule, consecutive confirmation, breath-wait timeout, heartbeat/poll intervals, HTTP timeout and Wi-Fi/recovery intervals.
- Median baseline and capture summaries; complete per-channel capture bursts are sent to the existing preprocessing API. Rail samples, unstable baseline windows, excessive configured capture span and invalid environmental data stop the scan. No plausible DHT substitutes are generated.
- Structured ArduinoJson response parsing replaces substring matching. Armed patient/session/device information comes from authenticated backend responses; heartbeat/status responses also validate source, sensor configuration and binding.
- Uses `X-Device-Key`; provider ownership/device identity are resolved server-side. No provider JWT or fixed patient ID resides in firmware configuration.
- Stores the attempted session before acquisition. Stores one versioned device-bound NVS outbox with the exact payload before POST. A restart recovers that payload/IDs instead of reacquiring; a restart before payload persistence requires a new provider scan.
- Receipt-first recovery: confirmed receipt completes locally; 410 tombstone suppresses replay; 404 receipt requires an active matching session before the same payload can be sent. Lost/malformed success, network, authentication and 5xx failures retain the pending bytes. Cancellation, expiry and replacement cannot accept a new reading. Repeated HTTP requests remain one logical acquisition, enforced by backend receipts.
- Warmup still applies before any new acquisition after restart recovery. Failed NVS writes/clears, malformed journals and binding mismatches stop further acquisition.
- Private Wi-Fi/API/device credentials moved to ignored configuration headers. HTTPS uses a trusted CA and waits for a plausible synchronized clock from the configured NTP source; it never calls `setInsecure()`. HTTP requires explicit private-development opt-in. Redirects are disabled. Logs contain states/errors, not credentials, patient identifiers, raw measurements or response bodies.
- Nonblocking scheduled warmup/sampling/Wi-Fi retry replaces long repeated delays. Individual HTTP operations are bounded by configured timeouts and can still pause sampling. Timing/jitter remains a bench-verification requirement.

### Modified files

| File | Change |
| --- | --- |
| `iot-prototype/esp32/esp32_breathdx/esp32_breathdx.ino` | Acquisition stages, authenticated structured protocol, validation, journal/recovery, private configuration and TLS clock |
| `iot-prototype/esp32/esp32_breathdx/acquisition_core.h` | Pure ADC/environment validation, median/window quality, configurable detection and rollover-safe timing |
| `iot-prototype/esp32/esp32_breathdx/acquisition_core_tests.h` | 18 compile-time C++ assertions using mock sample windows |
| `iot-prototype/esp32/esp32_breathdx/sensor_config_defaults.h` | Fail-closed configurable acquisition settings |
| `iot-prototype/esp32/esp32_breathdx/sensor_config.h.example` | Unconfigured GPIO/warmup/detection/quality/attenuation template |
| `iot-prototype/esp32/esp32_breathdx/device_secrets.h.example` | Empty private Wi-Fi/API/device/CA/NTP template |
| `iot-prototype/tests/compile_firmware.ps1` | Reproducible installed-toolchain builds and assertions, excluding private headers |
| `backend/tests/test_firmware_integration.py` | Nine isolated device-protocol/mock-sensor integration tests |
| `iot-prototype/README.md` | Current workflow/configuration; outdated active MQ instructions removed |
| `backend/SENSOR_CONFIGURATION.md` | Firmware section reflects baseline/detection/capture/recovery preparation |
| `STEP6_IOT_INTEGRATION_REPORT.md` | This report |

## Sensor configuration and quality rules

| Setting | Default / meaning |
| --- | --- |
| `TGS822_PIN`, `TGS2620_PIN`, `DHT_PIN` | `-1`; must be separate verified board pins; gas pins must expose ADC channels |
| `BREATHDX_SENSOR_WIRING_CONFIRMED` | `0`; acquisition disabled |
| `BREATHDX_SENSOR_WARMUP_MS` | `0`; acquisition disabled until protocol duration is supplied |
| `BREATHDX_DETECTION_PROTOCOL_CONFIGURED` | `0`; acquisition disabled |
| `BREATHDX_TGS822_DELTA_ADC`, `BREATHDX_TGS2620_DELTA_ADC` | `0`; disabled. Positive raw-count changes must be determined experimentally, range 1–4093 |
| Channel direction | `+1` placeholders; each must be experimentally verified as `+1` or `-1` for its circuit |
| `BREATHDX_REQUIRE_BOTH_CHANNELS` | `1` (AND); `0` selects OR; invalid either channel always rejects detection |
| Baseline quality span | `0`; disabled until a positive protocol limit is supplied |
| Baseline/capture counts | 32 / 64; configurable 3–128 samples per channel |
| Nominal sample interval | 20 ms; unverified software starting point, not a validated sensor response time |
| Confirmation samples | 3 consecutive qualifying paired samples; unverified starting point |
| Capture maximum span | 4093 ADC counts; bounds-only default, not an established noise-quality threshold |
| Local breath wait | 60 seconds after baseline; configurable below 15 minutes |
| Poll/heartbeat | 2 seconds; heartbeat does not extend backend expiry |
| DHT interval | 2 seconds minimum; actual recent read, no imputation |
| Wi-Fi/recovery/HTTP timeout | 5 seconds each by default |
| ADC resolution / usable values | 12 bits; raw samples 1–4094; rails 0/4095 rejected |
| ADC attenuation | `ADC_0db` placeholder; choose from exact board/input specifications, not from this report |

Software configuration is **not calibration evidence**. Detection is a configurable ADC-change gate, not verified breath/acetone detection. Noise checks/median filtering do not establish chemical selectivity or glucose accuracy. Each new scan obtains new baselines; capture retains each channel separately.

DHT `begin()` has no reliable initialization-success result in the installed API; firmware identifies failure through missing/non-finite/out-of-range subsequent reads. In-range floating or disconnected analog inputs can still look plausible and must be found through bench testing. No automatic software test establishes correct wiring.

## Backend API payload compatibility

Firmware sends only the existing `SensorData` contract:

| Field | Units / source |
| --- | --- |
| `patient_id` | Positive integer from authenticated listener |
| `scan_session_id` | Backend-generated 32-character normalized UUID |
| `acquisition_id` | One 128-bit random hex ID, retained with the exact payload across retries/restarts |
| `sensor_configuration` | `tgs822_tgs2620` |
| `tgs822_raw_adc`, `tgs2620_raw_adc` | Integer capture medians, raw counts 1–4094 |
| `tgs822_baseline_adc`, `tgs2620_baseline_adc` | Observed per-channel baseline medians; firmware requires non-rail values |
| `tgs822_samples_adc`, `tgs2620_samples_adc` | Separate integer capture arrays, each 3–128 samples; within backend 3–512 limit |
| `temperature` | Actual DHT22 °C; API range −40 through 80 |
| `humidity` | Actual DHT22 percent; API range 0 through 100 |

There is deliberately no client-supplied provider/device override, fabricated timestamp, PPM, glucose, synthetic flag or unsupported calibration coefficient. Device identity/provider ownership are assigned by the authenticated key and existing scan. Backend preprocessing and model availability/version metadata remain authoritative.

Endpoints reused unchanged: `GET /readings/listener/armed-patient`, `POST /readings/scans/{id}/heartbeat`, `GET /readings/scans/{id}`, `GET /readings/acquisitions/{id}`, `POST /readings/sensor`. Provider-only arming/cancellation remains provider-only. Firmware local rejection/timeout does not grant device cancellation permission: the provider must cancel/rearm, or the server session expires. The provider dashboard may therefore show collecting temporarily after a local failure, followed by disconnected/expired until provider action.

Success responses must contain bounded JSON with Content-Length (up to 32 KiB). Unknown-length/chunked, malformed or oversized responses are unconfirmed, never treated as saved. Verify reverse-proxy response framing if adding a gateway. The current FastAPI JSON API returns Content-Length. TLS/HTTP behavior has not been exercised on a physical ESP32.

## Actual tests and compilation

| Verification | Result |
| --- | --- |
| Full backend regressions | **137 tests passed**, including nine new hardware-free firmware-protocol integration tests |
| Existing web/mobile client regressions | **29 tests passed** |
| Initial installed-toolchain firmware builds | Passed for `esp32:esp32:esp32`, with 18 C++ acquisition assertions enabled |
| Final reproducible public-profile builds | **Both passed**: acquisition-disabled default and pin-probe profiles, each with all 18 C++ acquisition assertions enabled; final copied source hash matched current firmware and no private headers were present |
| Physical upload/board operation | **Not performed / unverified** |
| Actual sensor/wiring/breath/TLS/NVS power-loss behavior | **Unverified** |
| Root/nested-mobile Git whitespace checks | **Passed** |

Both final reference builds used **1,029,758 bytes (78%)** of the default 1,310,720-byte application partition and **48,612 bytes (14%)** of global dynamic memory, leaving 279,068 bytes before runtime allocations. These are compiler figures; TLS/JSON peak heap use and actual board partition suitability remain unverified. Build outputs stay under ignored `output/step6`; no upload was executed.

Installed tools discovered locally: Arduino CLI bundled with Arduino IDE, ESP32 Arduino core **3.3.8**, ArduinoJson **7.4.3**, Adafruit DHT library **1.4.7** and its existing Unified Sensor dependency. No toolchain/library downloads or upgrades were performed. The reference FQBN is **ESP32 Dev Module**; the exact physical board has not been identified. A reference build does not verify the user's actual board variant, flash settings or pin map.

The 18 C++ assertions evaluate the actual helper functions during compilation: valid/rail ADC bounds, median filtering, even median, stable/noisy/incomplete windows, environmental bounds, both channel polarities, unconfigured threshold suppression, AND/OR detection, broken secondary channel and `millis()` rollover. These are compiler-executed pure-function tests, not hardware runtime tests.

The nine Python tests execute a **device protocol emulator with mock sensors** against real authenticated FastAPI routes and isolated SQLite. They cover burst/baseline schema compatibility and consumer retrieval; lost POST response/restart receipt recovery without another POST; unsaved outbox replay and duplicate prevention; cancelled/expired/replaced sessions; deleted receipt suppression; authentication/backend failure preserving journal bytes; invalid/missing data; wrong patient/simulation channel rejection; and active-firmware legacy/credential checks. They do not execute the full Arduino state machine or ESP32 Preferences implementation. Mock device packets are used only in isolated test databases and are not experimental training/evaluation data.

Development test failures were confined to the new test fixture's session setup/teardown; those were corrected before the complete suite passed. Non-failing existing diagnostics include passlib/bcrypt version-reporting and naive-UTC deprecation warnings plus intentional sanitized backend fault logs. Frontend files and dependencies were not changed, so no new frontend build/export was needed in Step 6; their Step 5 verification remains documented separately.

## Hardware wiring and electrical requirements

Before supplying power, identify the exact ESP32 board/module and exact gas-sensor parts/modules. Review the actual circuit and pin numbering against manufacturer documents. TGS822 and TGS2620 are distinct heater/sensing circuits; do not substitute MQ wiring, heater supplies or load resistors. The official [TGS2620 product information](https://www.figarosensor.com/product/docs/tgs2620_product%20infomation%28en%29_rev02.pdf) and [TGS822 product information](https://www.figarosensor.com/product/docs/tgs822_productinfo_131212.pdf) describe their separate circuits; they are not evidence of validated acetone measurement in this project.

- Verify heater/circuit power, current budget, load resistance, grounding and thermal safety. Do not power gas heaters from GPIOs. Check bare sensor versus conditioned module differences.
- Measure worst-case analog output before connecting it to the ESP32. Use verified attenuation/protection/conditioning appropriate to the exact ADC input limits; attenuation does not grant overvoltage tolerance. No circuit voltages, protection ratios or electrical suitability are assumed here.
- Verify two independent ADC channels, ADC/Wi-Fi coexistence, board-specific reserved/boot pins and actual DHT pin/pull-up/supply. Original ESP32 ADC2 has Wi-Fi limitations documented by [Espressif](https://docs.espressif.com/projects/esp-idf/en/v4.2.5/esp32/api-reference/peripherals/adc.html); do not transfer pin assumptions to other ESP32 families. Consult the current [Arduino ESP32 ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).
- Observe independent baseline drift, noise, rail saturation, response polarity and recovery under controlled conditions. Choose warmup/stabilization duration from actual hardware evidence. Manufacturer conditioning procedures are not interchangeable with a short boot delay.
- Validate DHT behavior with the installed library and sensor. Its [read implementation](https://github.com/adafruit/DHT-sensor-library/blob/master/DHT.cpp) uses a two-second sampling interval; firmware does not force faster reads.
- Verify restart/power-loss at journal write, upload and receipt-clear boundaries. NVS write success in software is not measured power-failure reliability. The pending outbox contains patient linkage/raw readings and is not encrypted by this sketch; restrict physical access and address device flash/NVS protection before deployment.

Previously embedded private Wi-Fi settings were removed from active source. If any credentials were shared or committed previously, rotate them through their owning system; removing them from the current file does not erase Git history. Do not log private headers or publish credential-bearing firmware binaries.

## Remaining calibration/experimental work

Establish consented, de-identified real paired acquisition/reference measurements; document sensor/module identifiers, circuit/ADC settings, warmup, baseline protocol, airflow/sample timing, per-channel polarity/noise limits, DHT conditions, interferents and repeatability. Validate any acetone concentration mapping and environmental correction separately. Only then train/evaluate the prepared regression pipeline using real data with appropriate patient-separated evaluation. No calibration coefficient, dataset, model accuracy, clinical threshold or medical validation is supplied by Step 6.

## Exact local instructions

### Hardware-free tests

From `backend`:

```powershell
.\venv\Scripts\python.exe -B -m unittest discover -s tests -q
# Focused firmware protocol checks:
.\venv\Scripts\python.exe -B -m unittest discover -s tests -p test_firmware_integration.py -v
```

From `frontend-web`:

```powershell
node --test tests/monitoring.test.mjs tests/integration.test.mjs
```

From repository root, using the already-installed local Arduino configuration:

```powershell
.\iot-prototype\tests\compile_firmware.ps1
```

The script copies only public sketch/helper files to `output/step6/public-sketch/esp32_breathdx`, excludes private headers, and compiles default and pin-probe profiles with all assertions. The pin-probe values 34/35/4 are **compiler fixtures only**, not proposed hardware wiring. Both public builds remain acquisition-disabled. It does not upload. All output is ignored by Git.

For another existing installation/identified board, supply its actual paths/FQBN:

```powershell
.\iot-prototype\tests\compile_firmware.ps1 -Fqbn 'YOUR_VERIFIED_FQBN' -ArduinoCli 'C:\path\arduino-cli.exe' -ArduinoData 'C:\path\Arduino15' -ArduinoUser 'C:\path\Arduino'
```

Placeholders must be replaced. Missing dependencies/toolchain are prerequisites to resolve deliberately; the script does not install them. ArduinoJson usage follows its [official deserialization API](https://arduinojson.org/v7/api/json/deserializejson/).

### Configure the real firmware after electrical review

1. Copy the two `.example` headers to `sensor_config.h` and `device_secrets.h` beside the sketch. They are ignored by Git. Enter private values locally; never paste them into reports or source commits.
2. Set verified distinct gas ADC pins and DHT pin, correct board attenuation, warmup and experiment-specific baseline/detection/capture settings. Set wiring/protocol confirmation flags only after completing those reviews. No usable physical thresholds are provided in the template.
3. Match backend private settings `BREATHDX_DEVICE_KEY` (at least 32 characters), `BREATHDX_DEVICE_ID` and `BREATHDX_DEVICE_MEDICAL_ID` (the owning provider). Configure firmware's matching device ID/key, Wi-Fi credentials and API URL. The backend chooses the patient through provider arming.
4. Prefer HTTPS with the correct trusted root CA and reachable NTP time source. The CA/server must match the hostname; verify certificates and device time on the bench. Controlled private HTTP development requires `BREATHDX_ALLOW_LOCAL_HTTP=1`; do not use this on an untrusted/public network.
5. Use the real private development backend (normally port 8001) and provider web application. For bench tests, configure a separate disposable development database and synthetic provider/patient, with estimation disabled. The existing loopback-only UI fixture is not a physical ESP32 LAN endpoint and must not be made public.

### Compile/upload for the identified physical board

In Arduino IDE, open `iot-prototype/esp32/esp32_breathdx/esp32_breathdx.ino`, select the **verified physical board and port**, confirm existing ESP32/DHT/ArduinoJson libraries, then Verify. A compile succeeds independently of sensor correctness. Keep private build outputs local.

Equivalent CLI compile from repository root (replace the FQBN with the identified board):

```powershell
$cliPath = 'C:\Users\Kian\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'
& $cliPath --config-file output/step6/arduino-cli.yaml compile --fqbn 'YOUR_VERIFIED_FQBN' --build-path output/step6/private-board-build iot-prototype/esp32/esp32_breathdx
```

**Only after power/wiring/board checks and selecting the actual port**, manually upload:

```powershell
& $cliPath --config-file output/step6/arduino-cli.yaml upload --fqbn 'YOUR_VERIFIED_FQBN' --port 'YOUR_VERIFIED_COM_PORT' --input-dir output/step6/private-board-build iot-prototype/esp32/esp32_breathdx
```

No upload command was executed during Step 6. Do not flash the public pin-probe test images. Open Serial Monitor at 115200; it reports states/errors without raw patient measurements or credentials.

### Safe initial bench verification

1. Start acquisition-disabled; confirm correct board boot, private configuration and electrically measured safe inputs before enabling acquisition.
2. On a disposable development database, arm one synthetic test patient through provider Live Scan → ESP32 Listener. Keep sensors in the defined baseline conditions during baseline collection.
3. Observe baseline/waiting/capture/recovery states using safe controlled stimuli under the experimental protocol. Confirm exactly one reading/receipt with matching patient/provider/device/session/acquisition IDs, raw channels/baselines/DHT metadata and unavailable uncalibrated outputs.
4. Cancel/replace/expire scans during baseline/wait/capture. Ensure no fresh reading is accepted. Test invalid/saturated analog input and missing DHT safely; confirm no substituted values or fabricated results.
5. Interrupt Wi-Fi/backend before upload, after persistence but before response, and restart with/without a durable payload. Verify same-ID receipt recovery, no duplicate record and no automatic second capture for an attempted session. Do not erase NVS merely to force a retry; first reconcile backend receipt/session status.
6. Verify TLS/time synchronization, NVS power-loss behavior, sample timing under HTTP traffic and dashboard/mobile retrieval on actual hardware. Record these as hardware evidence only when performed.

Physical board identity, wiring, voltage compatibility, breath behavior, calibration, upload and mobile-device observation remain unverified.
