# BreathDx IoT Prototype - Next Step

This folder starts the real hardware integration step for:
- ESP32
- MQ138 gas sensor
- DHT22 temperature/humidity sensor

The firmware sends live packets to your existing backend endpoint:
- `POST /readings/sensor`

## Files

- `esp32/esp32_breathdx.ino` - ESP32 firmware template

## Hardware Wiring (prototype)

- MQ138 AOUT -> ESP32 `GPIO34` (ADC)
- MQ138 VCC -> 5V or 3.3V (based on your module)
- MQ138 GND -> GND
- DHT22 DATA -> `GPIO4`
- DHT22 VCC -> 3.3V
- DHT22 GND -> GND
- Optional trigger button -> `GPIO14` to GND (INPUT_PULLUP)

## Before flashing

1. Open `esp32_breathdx.ino`.
2. Set:
   - `WIFI_SSID`
   - `WIFI_PASSWORD`
   - `API_URL` (must be your PC LAN IP, not localhost)
3. Default `PATIENT_ID` can be changed in code.

## Run flow

1. Start backend server (FastAPI) and frontend app.
2. Open Medical -> Live Scan -> ESP32 Listener.
3. Select the matching patient and click Start Listening.
4. On ESP32:
   - wait for warmup completion in Serial Monitor
   - send command `s` in serial monitor OR press the button
5. The uploaded reading should appear in Live Scan instantly (WebSocket push) or via fallback polling.

## Notes for reliable testing

- Keep sensor warmup period before first breath test.
- Use consistent breath distance and duration (around 5-10 seconds).
- If backend is on another machine, ensure firewall allows port 8000.
- This system is for monitoring and trend tracking only, not diagnosis.
