# BreathDX ESP32 integration

Active firmware: `esp32/esp32_breathdx/esp32_breathdx.ino` — **TGS822 primary
acetone-related gas input, TGS2620 secondary gas input, DHT22 and ESP32**.
Neither gas channel is established here as acetone-specific. No concentration,
glucose conversion or medical interpretation runs on the ESP32.

See [Step 6 configuration, tests and hardware requirements](../STEP6_IOT_INTEGRATION_REPORT.md)
and [backend sensor contract](../backend/SENSOR_CONFIGURATION.md).

## Configuration

Copy `sensor_config.h.example` to ignored `sensor_config.h` and
`device_secrets.h.example` to ignored `device_secrets.h`. Choose GPIOs and ADC
attenuation for the exact board and protected analog circuit. Warmup, baseline
stability, per-channel polarity/delta and detection confirmation require an
experimental protocol. Defaults disable acquisition. Software timing/sample
counts are starting settings, not physically verified values.

Private Wi-Fi credentials, API URL, device ID/key and trusted HTTPS root CA live
only in the private header. Device ID/key must match backend settings and provider
assignment. Never use a provider JWT or hardcoded patient ID. HTTPS validates the
configured CA; no insecure TLS mode exists. Plain HTTP requires explicit private
LAN opt-in and exposes the key to that network. Never commit private headers or
share compiled credential-bearing images.

## Workflow

1. Configured warmup, then provider Live Scan → ESP32 Listener arming.
2. Authenticated polling supplies patient/session/device context; journal session.
3. Heartbeat validates ownership, sensor configuration and active session state.
4. Acquire stable paired baselines; wait for consecutive configured ADC changes.
5. Capture separate sample bursts; validate rails, quality span and actual DHT data.
6. Persist one exact payload/acquisition ID before POST.
7. Check receipt and active session, then upload/replay only the same payload.
8. Confirm saved receipt and clear the pending payload. Never create a second ID
   for that attempted session; deleted receipts also prevent replay.

Backend device authentication enforces provider/patient ownership, cancellation,
expiry, replacement and duplicate prevention. Retries can use multiple HTTP
requests but remain one logical acquisition. Restart with a durable outbox
recovers it; restart before payload persistence requires a new provider scan.
Local capture failures/timeouts require provider cancel/rearm. Devices are not
authorized to cancel provider sessions themselves.

Payload: `sensor_configuration: tgs822_tgs2620`, patient/session/acquisition IDs,
separate raw ADC/baselines and sample arrays, temperature °C and humidity %. No
legacy MQ fields or medical predictions are uploaded. Board/device identity is
checked in responses and bound server-side to the private device key.

## Limits

Compilation and mock protocol tests do not verify wiring, electrical tolerance,
heater supply, actual sensor initialization, breath specificity, flash power-loss
behavior or accuracy. Verify these before connecting hardware.
[Archived MQ-138 notes](MQ138-BREATH-GUIDE.md) preserve historical information;
their wiring/calibration assumptions must not be applied to the active firmware.
