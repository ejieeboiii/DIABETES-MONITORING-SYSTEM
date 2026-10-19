#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <esp_system.h>
#include <time.h>
#include "sensor_config_defaults.h"
#include "acquisition_core.h"
#if __has_include("device_secrets.h")
#include "device_secrets.h"
#endif
#ifndef BREATHDX_WIFI_SSID
#define BREATHDX_WIFI_SSID ""
#endif
#ifndef BREATHDX_WIFI_PASSWORD
#define BREATHDX_WIFI_PASSWORD ""
#endif
#ifndef BREATHDX_API_URL
#define BREATHDX_API_URL ""
#endif
#ifndef BREATHDX_DEVICE_KEY
#define BREATHDX_DEVICE_KEY ""
#endif
#ifndef BREATHDX_DEVICE_ID
#define BREATHDX_DEVICE_ID ""
#endif
#ifndef BREATHDX_ROOT_CA
#define BREATHDX_ROOT_CA ""
#endif
#ifndef BREATHDX_ALLOW_LOCAL_HTTP
#define BREATHDX_ALLOW_LOCAL_HTTP 0
#endif
#ifndef BREATHDX_NTP_SERVER
#define BREATHDX_NTP_SERVER ""
#endif
static_assert(BREATHDX_BASELINE_SAMPLES >= 3 && BREATHDX_BASELINE_SAMPLES <= breathdx::MAX_SAMPLES, "Baseline count");
static_assert(BREATHDX_CAPTURE_SAMPLES >= 3 && BREATHDX_CAPTURE_SAMPLES <= breathdx::MAX_SAMPLES, "Capture count");
static_assert(BREATHDX_SAMPLE_INTERVAL_MS > 0 && BREATHDX_SAMPLE_INTERVAL_MS < 60000, "Sample interval");
static_assert(BREATHDX_POLL_MS >= 500 && BREATHDX_POLL_MS <= 10000, "Heartbeat interval");
static_assert(BREATHDX_DHT_INTERVAL_MS >= 2000, "DHT22 interval");
static_assert(BREATHDX_BREATH_CONFIRM_SAMPLES > 0 && BREATHDX_BREATH_CONFIRM_SAMPLES <= 512, "Confirmation count");
static_assert(BREATHDX_CAPTURE_MAX_SPAN_ADC >= 0 && BREATHDX_CAPTURE_MAX_SPAN_ADC <= 4093, "Capture quality span");
static_assert(BREATHDX_REQUIRE_BOTH_CHANNELS == 0 || BREATHDX_REQUIRE_BOTH_CHANNELS == 1, "Detection rule");
static_assert(BREATHDX_BREATH_TIMEOUT_MS > 0 && BREATHDX_BREATH_TIMEOUT_MS < 900000, "Breath timeout");
static_assert(BREATHDX_SENSOR_WARMUP_MS < 0x80000000UL, "Warmup rollover limit");

enum class Phase { Disabled, Warmup, Idle, Baseline, Waiting, Capturing, Recovery, Fault };
Phase phase = Phase::Disabled;
DHT dht(DHT_PIN, DHT22);
Preferences journal;
String sessionId, acquisitionId, lastSession, pendingPayload;
long patientId = 0;
int primarySamples[breathdx::MAX_SAMPLES], secondarySamples[breathdx::MAX_SAMPLES];
int count = 0, baselinePrimary = 0, baselineSecondary = 0, confirmations = 0;
uint32_t warmupDeadline, nextWifi = 0, nextPoll = 0, nextSample = 0, nextRecovery = 0;
uint32_t waitingDeadline = 0, nextDht = 0;
float temperature = NAN, humidity = NAN;
bool clockConfigured = false;

bool validId(const String& id) {
  if (id.length() != 32) return false;
  for (char c : id) if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'))) return false;
  return true;
}
bool validDevice(const String& id) {
  if (!id.length() || id.length() > 100) return false;
  for (char c : id) if (!isalnum(static_cast<unsigned char>(c)) && c != '_' && c != '-' && c != '.') return false;
  return true;
}
String newAcquisitionId() {
  char id[33];
  snprintf(id, sizeof(id), "%08lx%08lx%08lx%08lx", (unsigned long)esp_random(),
    (unsigned long)esp_random(), (unsigned long)esp_random(), (unsigned long)esp_random());
  return String(id);
}
// Never log response bodies, credentials, identifiers or measurements.
int request(const char* method, const String& path, const String& payload, JsonDocument& result) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  String base = BREATHDX_API_URL;
  while (base.endsWith("/")) base.remove(base.length() - 1);
  WiFiClient plain; WiFiClientSecure secure; HTTPClient http;
  bool opened = false;
  if (base.startsWith("https://") && strlen(BREATHDX_ROOT_CA)) {
    // Do not bypass TLS validation when the device clock is unset.
    if (time(nullptr) < 1704067200) return -1; // 2024-01-01, sanity floor only
    secure.setCACert(BREATHDX_ROOT_CA); opened = http.begin(secure, base + path);
  } else if (base.startsWith("http://") && BREATHDX_ALLOW_LOCAL_HTTP) opened = http.begin(plain, base + path);
  if (!opened) return -1;
  http.setTimeout(BREATHDX_HTTP_TIMEOUT_MS); http.setConnectTimeout(BREATHDX_HTTP_TIMEOUT_MS);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  http.addHeader("X-Device-Key", BREATHDX_DEVICE_KEY); http.addHeader("Content-Type", "application/json");
  int status = strcmp(method, "GET") == 0 ? http.GET() : http.POST(payload);
  if (status >= 200 && status < 300) {
    if (http.getSize() < 0 || http.getSize() > 32768) status = -2;
    else {
      String body = http.getString();
      if (body.length() > 32768 || deserializeJson(result, body, DeserializationOption::NestingLimit(12))) status = -2;
    }
  }
  http.end();
  if (status == 401 || status == 403) Serial.println("Device authentication rejected; check private configuration.");
  else if (status >= 500 || status < 0) Serial.println("Backend response unavailable or malformed.");
  return status;
}
void finishScan(const char* message) {
  if (journal.isKey("pending") && !journal.remove("pending")) {
    phase = Phase::Fault; Serial.println("Journal clear failed; stopped."); return;
  }
  pendingPayload = ""; sessionId = ""; acquisitionId = ""; patientId = 0;
  count = 0; confirmations = 0;
  phase = breathdx::due(millis(), warmupDeadline) ? Phase::Idle : Phase::Warmup;
  nextPoll = millis(); Serial.println(message);
}
bool responseBinding(JsonVariantConst response) {
  return response["session_id"].as<String>() == sessionId && response["patient_id"].is<long>() &&
    response["patient_id"].as<long>() == patientId && response["device_id"].as<String>() == BREATHDX_DEVICE_ID &&
    response["sensor_configuration"].as<String>() == "tgs822_tgs2620" && response["source"].as<String>() == "device";
}
bool activeStatus(JsonVariantConst response) {
  String status = response["status"].as<String>();
  return responseBinding(response) && (status == "pending" || status == "collecting");
}
bool heartbeat() {
  JsonDocument response;
  int status = request("POST", "/readings/scans/" + sessionId + "/heartbeat", "", response);
  if (status == 200 && activeStatus(response.as<JsonVariantConst>())) return true;
  // Without a payload, any unconfirmed scan stops acquisition. Durable lastSession
  // prevents a restart from silently acquiring a second sample for this scan.
  finishScan("Scan inactive or heartbeat unconfirmed; request a new scan."); return false;
}
bool receiptMatches(JsonVariantConst response) {
  JsonVariantConst reading = response["reading"];
  return reading["acquisition_id"].as<String>() == acquisitionId && reading["scan_session_id"].as<String>() == sessionId &&
    reading["patient_id"].is<long>() && reading["patient_id"].as<long>() == patientId &&
    reading["device_id"].as<String>() == BREATHDX_DEVICE_ID && reading["sensor_configuration"].as<String>() == "tgs822_tgs2620" &&
    reading["is_simulated"].is<bool>() && !reading["is_simulated"].as<bool>();
}
void recoverUpload() {
  JsonDocument receipt;
  int status = request("GET", "/readings/acquisitions/" + acquisitionId, "", receipt);
  if (status == 200) {
    if (receiptMatches(receipt.as<JsonVariantConst>())) finishScan("Acquisition persistence confirmed.");
    else { phase = Phase::Fault; Serial.println("Receipt binding mismatch; stopped."); }
    return;
  }
  if (status == 410) { finishScan("Saved acquisition deleted; replay suppressed."); return; }
  if (status != 404) { Serial.println("Receipt unavailable; retain journal and retry status."); return; }
  JsonDocument scan;
  status = request("GET", "/readings/scans/" + sessionId, "", scan);
  if (status == 404) { finishScan("Scan unavailable; upload suppressed."); return; }
  if (status != 200) return; // Offline/auth/5xx never implies an unsaved reading.
  if (!responseBinding(scan.as<JsonVariantConst>())) { phase = Phase::Fault; Serial.println("Scan binding mismatch; stopped."); return; }
  if (!activeStatus(scan.as<JsonVariantConst>())) { finishScan("Scan terminal; upload suppressed."); return; }
  JsonDocument saved;
  status = request("POST", "/readings/sensor", pendingPayload, saved);
  if (status == 200 && receiptMatches(saved.as<JsonVariantConst>())) finishScan("Acquisition persistence confirmed.");
  else if (status == 400 || status == 422) finishScan("Payload rejected; correct acquisition and request a new scan.");
  else Serial.println("Upload unconfirmed; retain identical payload and check receipt.");
}
// Injectable sampler supports compile-time mock checks without fabricating a
// physical device upload. Production calls analogRead; no mock mode is flashed.
using AdcReader = uint16_t (*)(uint8_t);
AdcReader adcReader = analogRead;
bool takePair(int& primary, int& secondary) {
  primary = adcReader(TGS822_PIN); secondary = adcReader(TGS2620_PIN);
  return breathdx::validGas(primary) && breathdx::validGas(secondary);
}
void capturePayload() {
  if (!breathdx::validWindow(primarySamples, count, BREATHDX_CAPTURE_MAX_SPAN_ADC) ||
      !breathdx::validWindow(secondarySamples, count, BREATHDX_CAPTURE_MAX_SPAN_ADC) ||
      !breathdx::validEnvironment(temperature, humidity)) { finishScan("Capture/environment quality rejected; no upload."); return; }
  if (!heartbeat()) return;
  acquisitionId = newAcquisitionId(); JsonDocument payload;
  payload["patient_id"] = patientId; payload["scan_session_id"] = sessionId; payload["acquisition_id"] = acquisitionId;
  payload["sensor_configuration"] = "tgs822_tgs2620";
  payload["tgs822_raw_adc"] = breathdx::median(primarySamples, count); payload["tgs2620_raw_adc"] = breathdx::median(secondarySamples, count);
  payload["tgs822_baseline_adc"] = baselinePrimary; payload["tgs2620_baseline_adc"] = baselineSecondary;
  payload["temperature"] = temperature; payload["humidity"] = humidity;
  JsonArray primary = payload["tgs822_samples_adc"].to<JsonArray>(); JsonArray secondary = payload["tgs2620_samples_adc"].to<JsonArray>();
  for (int i = 0; i < count; ++i) { primary.add(primarySamples[i]); secondary.add(secondarySamples[i]); }
  serializeJson(payload, pendingPayload);
  // Single NVS value contains exact bytes before POST; credentials are not stored.
  JsonDocument envelope;
  envelope["version"] = 1; envelope["device_id"] = BREATHDX_DEVICE_ID; envelope["payload"] = pendingPayload;
  String durable; serializeJson(envelope, durable);
  if (journal.putString("pending", durable) != durable.length() || journal.getString("pending") != durable) {
    phase = Phase::Fault; Serial.println("Journal write failed; upload blocked."); return;
  }
  phase = Phase::Recovery; nextRecovery = millis(); Serial.println("Capture ready; verifying/uploading acquisition.");
}
void pollScan() {
  JsonDocument response;
  int status = request("GET", "/readings/listener/armed-patient", "", response);
  if (status != 200 || !response["armed"].is<bool>() || !response["armed"].as<bool>()) return;
  String selected = response["session_id"].as<String>();
  if (!validId(selected) || selected == lastSession || !response["patient_id"].is<long>() ||
      response["patient_id"].as<long>() <= 0 || response["device_id"].as<String>() != BREATHDX_DEVICE_ID) return;
  sessionId = selected; patientId = response["patient_id"].as<long>();
  if (journal.putString("last", sessionId) != sessionId.length() || journal.getString("last") != sessionId) {
    phase = Phase::Fault; Serial.println("Session journal failed; stopped."); return;
  }
  lastSession = sessionId; if (!heartbeat()) return;
  count = 0; confirmations = 0; phase = Phase::Baseline; nextSample = millis(); nextPoll = millis() + BREATHDX_POLL_MS;
  temperature = NAN; humidity = NAN; nextDht = millis(); Serial.println("Acquiring baseline; keep inlet in baseline conditions.");
}
void setup() {
  Serial.begin(115200);
  bool configured = BREATHDX_SENSOR_WIRING_CONFIRMED && BREATHDX_DETECTION_PROTOCOL_CONFIGURED &&
    TGS822_PIN >= 0 && TGS2620_PIN >= 0 && DHT_PIN >= 0 && TGS822_PIN != TGS2620_PIN && TGS822_PIN != DHT_PIN && TGS2620_PIN != DHT_PIN &&
    digitalPinToAnalogChannel(TGS822_PIN) >= 0 && digitalPinToAnalogChannel(TGS2620_PIN) >= 0 &&
    BREATHDX_SENSOR_WARMUP_MS > 0 && BREATHDX_TGS822_DELTA_ADC > 0 && BREATHDX_TGS822_DELTA_ADC <= 4093 &&
    BREATHDX_TGS2620_DELTA_ADC > 0 && BREATHDX_TGS2620_DELTA_ADC <= 4093 && BREATHDX_BASELINE_MAX_SPAN_ADC > 0 && BREATHDX_BASELINE_MAX_SPAN_ADC <= 4093 &&
    (BREATHDX_TGS822_DIRECTION == 1 || BREATHDX_TGS822_DIRECTION == -1) && (BREATHDX_TGS2620_DIRECTION == 1 || BREATHDX_TGS2620_DIRECTION == -1) &&
    strlen(BREATHDX_WIFI_SSID) && strlen(BREATHDX_DEVICE_KEY) >= 32 && validDevice(BREATHDX_DEVICE_ID);
  String base = BREATHDX_API_URL;
  configured &= (base.startsWith("https://") && strlen(BREATHDX_ROOT_CA) && strlen(BREATHDX_NTP_SERVER)) || (base.startsWith("http://") && BREATHDX_ALLOW_LOCAL_HTTP);
  if (!configured) { Serial.println("Disabled: configure credentials, verified wiring and acquisition protocol."); return; }
  if (!journal.begin("breathdx", false)) { phase = Phase::Fault; Serial.println("Journal unavailable; stopped."); return; }
  warmupDeadline = millis() + BREATHDX_SENSOR_WARMUP_MS;
  lastSession = journal.getString("last"); String durable = journal.getString("pending");
  if (journal.isKey("pending") && !durable.length()) {
    phase = Phase::Fault; Serial.println("Unreadable pending journal; stopped."); return;
  }
  if (lastSession.length() && !validId(lastSession)) { phase = Phase::Fault; Serial.println("Invalid session journal; stopped."); return; }
  analogReadResolution(12); analogSetPinAttenuation(TGS822_PIN, BREATHDX_ADC_ATTENUATION); analogSetPinAttenuation(TGS2620_PIN, BREATHDX_ADC_ATTENUATION);
  pinMode(TGS822_PIN, INPUT); pinMode(TGS2620_PIN, INPUT); dht.begin();
  WiFi.mode(WIFI_STA); WiFi.begin(BREATHDX_WIFI_SSID, BREATHDX_WIFI_PASSWORD);
  if (durable.length()) {
    JsonDocument envelope;
    if (deserializeJson(envelope, durable) || envelope["version"].as<int>() != 1 ||
        envelope["device_id"].as<String>() != BREATHDX_DEVICE_ID || !envelope["payload"].is<const char*>()) {
      phase = Phase::Fault; Serial.println("Pending journal version/device mismatch; stopped."); return;
    }
    pendingPayload = envelope["payload"].as<String>();
    JsonDocument pending;
    if (deserializeJson(pending, pendingPayload) || !pending["patient_id"].is<long>()) { phase = Phase::Fault; Serial.println("Invalid pending journal; stopped."); return; }
    sessionId = pending["scan_session_id"].as<String>(); acquisitionId = pending["acquisition_id"].as<String>(); patientId = pending["patient_id"].as<long>();
    if (!validId(sessionId) || !validId(acquisitionId) || sessionId != lastSession || patientId <= 0 || pending["sensor_configuration"].as<String>() != "tgs822_tgs2620") {
      phase = Phase::Fault; Serial.println("Journal binding invalid; stopped."); return;
    }
    phase = Phase::Recovery; Serial.println("Restart: recover durable acquisition without reacquiring.");
  } else { warmupDeadline = millis() + BREATHDX_SENSOR_WARMUP_MS; phase = Phase::Warmup; Serial.println("Warmup; duration unverified."); }
}
void loop() {
  uint32_t now = millis();
  if (phase == Phase::Disabled || phase == Phase::Fault) { delay(50); return; }
  if (WiFi.status() != WL_CONNECTED && breathdx::due(now, nextWifi)) {
    WiFi.reconnect(); nextWifi = now + BREATHDX_WIFI_RETRY_MS; Serial.println("Wi-Fi unavailable; reconnecting.");
  }
  if (WiFi.status() == WL_CONNECTED && !clockConfigured && String(BREATHDX_API_URL).startsWith("https://")) {
    configTime(0, 0, BREATHDX_NTP_SERVER); clockConfigured = true;
    Serial.println("Synchronizing TLS clock; requests wait for valid time.");
  }
  if (phase == Phase::Warmup) { if (breathdx::due(now, warmupDeadline)) { phase = Phase::Idle; Serial.println("Ready; await provider scan."); } delay(5); return; }
  if (phase == Phase::Recovery) {
    if (WiFi.status() == WL_CONNECTED && breathdx::due(now, nextRecovery)) { recoverUpload(); nextRecovery = millis() + BREATHDX_RECOVERY_MS; }
    delay(5); return;
  }
  if (phase == Phase::Idle) {
    if (breathdx::due(now, nextPoll)) { pollScan(); nextPoll = millis() + BREATHDX_POLL_MS; }
    delay(5); return;
  }
  if (breathdx::due(now, nextPoll)) { if (!heartbeat()) return; nextPoll = millis() + BREATHDX_POLL_MS; }
  now = millis();
  if (breathdx::due(now, nextDht)) {
    temperature = dht.readTemperature(); humidity = dht.readHumidity(); nextDht = now + BREATHDX_DHT_INTERVAL_MS;
    if (!breathdx::validEnvironment(temperature, humidity)) { finishScan("DHT22 invalid; stopped without substitutes."); return; }
  }
  if (phase == Phase::Waiting && breathdx::due(now, waitingDeadline)) { finishScan("Local breath timeout; provider must cancel/rearm."); return; }
  if (!breathdx::due(now, nextSample)) { delay(1); return; } nextSample = now + BREATHDX_SAMPLE_INTERVAL_MS;
  int primary, secondary;
  if (!takePair(primary, secondary)) { finishScan("ADC invalid/saturated; no upload."); return; }
  if (phase == Phase::Waiting) {
    bool triggered = breathdx::breathTriggered(primary, secondary, baselinePrimary, baselineSecondary,
      BREATHDX_TGS822_DIRECTION, BREATHDX_TGS2620_DIRECTION, BREATHDX_TGS822_DELTA_ADC, BREATHDX_TGS2620_DELTA_ADC, BREATHDX_REQUIRE_BOTH_CHANNELS);
    confirmations = triggered ? confirmations + 1 : 0;
    if (confirmations < BREATHDX_BREATH_CONFIRM_SAMPLES) return;
    count = 0; phase = Phase::Capturing; Serial.println("Configured ADC change detected; breath specificity unverified.");
  }
  primarySamples[count] = primary; secondarySamples[count] = secondary; ++count;
  if (phase == Phase::Baseline && count == BREATHDX_BASELINE_SAMPLES) {
    if (!breathdx::validWindow(primarySamples, count, BREATHDX_BASELINE_MAX_SPAN_ADC) || !breathdx::validWindow(secondarySamples, count, BREATHDX_BASELINE_MAX_SPAN_ADC)) {
      finishScan("Unstable baseline; no upload."); return;
    }
    baselinePrimary = breathdx::median(primarySamples, count); baselineSecondary = breathdx::median(secondarySamples, count);
    count = 0; phase = Phase::Waiting; waitingDeadline = millis() + BREATHDX_BREATH_TIMEOUT_MS; Serial.println("Waiting for configured ADC change.");
  } else if (phase == Phase::Capturing && count == BREATHDX_CAPTURE_SAMPLES) capturePayload();
}
