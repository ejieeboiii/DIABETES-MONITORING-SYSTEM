# MQ-138 real breath testing guide

## Hardware

| Part | Connection |
|------|------------|
| MQ-138 AOUT | ESP32 **GPIO34** |
| MQ-138 VCC | **5V** (preferred for heater) or 3.3V per module |
| MQ-138 GND | GND |
| DHT22 DATA | GPIO4, VCC 3.3V, GND |

- Use a **data USB cable** for the ESP32.
- First power-on: sensor may need **hours** to fully stabilize; firmware uses **3 minutes** minimum warmup.
- Keep the sensor in **clean room air** during warmup (no breath, no alcohol wipes on the mesh).

## How a real scan works (firmware)

1. **Warmup** (3 min) — measures room-air baseline when done.
2. **Start Listening** on the web app (select patient).
3. Press **button** or type **`s`** in Serial Monitor.
4. Device measures **room baseline** again (5 s — do not breathe on it).
5. Serial prints: **EXHALE now** — breathe steadily **6–8 seconds**, lips **2–3 cm** from the sensor.
6. Firmware checks **rise above baseline** (not just room air).
7. If breath is detected → upload to server → result on **Live Scan**.

Commands:

| Key | Action |
|-----|--------|
| `s` | Full breath scan |
| `b` | Recalibrate room baseline (clean air only) |

## Good breath technique

- **Exhale** toward the sensor (ketone/acetone in breath).
- Do **not** only inhale over the sensor.
- Distance: **2–3 cm**, not touching the mesh.
- **5–8 seconds** steady exhale while the device samples.
- Avoid fans, open windows gusts, or hand sanitizer near the sensor before testing.

## Serial Monitor — what you want to see

```
Room baseline ADC: 850
>>> EXHALE now ...
Peak ADC: 1558  |  Rise above baseline: 708
Upload success
```

If **Rise above baseline** is under ~50, the firmware will reject the scan and ask you to try again.

## Tuning (Arduino code)

In `esp32_breathdx.ino`:

- `MIN_BREATH_DELTA` — increase if room noise causes false triggers; decrease if your breath is weak.
- `SENSOR_WARMUP_MS` — increase to `300000` (5 min) if readings drift.

## Backend

The server subtracts **baseline_adc** from the peak before converting to acetone PPM, so room air alone does not produce a false “high” reading.

## Limitations (honest)

- MQ-138 is a **VOC sensor**, not acetone-specific; alcohol, cleaners, and food can affect readings.
- This is a **monitoring prototype**, not a clinical acetone analyzer.
- For capstone demos, log **consistent technique** and compare **trends** for the same patient.
