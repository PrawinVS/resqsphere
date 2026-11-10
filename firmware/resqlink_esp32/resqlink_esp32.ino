
/*
  ==========================================================
              RESQLINK - ESP32 VEHICLE SAFETY
  ==========================================================

  Hardware:
    ESP32 DevKit V1
    NEO-6M GPS
    MPU6500-compatible IMU (WHO_AM_I = 0x70)
    Optional onboard status LED (GPIO 2)

  Features:
    GPS telemetry
    IMU acceleration and gyroscope readings
    Calibrated orientation / tilt monitoring
    Sustained rollover-candidate indication
    Wi-Fi connection and reconnection
    HTTP telemetry transmission
    Optional network status LED

  IMPORTANT:
    Tilt detection is an experimental prototype feature.
    It is NOT a validated accident detection system.
  ==========================================================
*/

#include <Wire.h>
#include <TinyGPSPlus.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <math.h>

// ==========================================================
// 1. WIFI AND SERVER CONFIGURATION
// ==========================================================

const char* WIFI_SSID = "Prawin's A36";
const char* WIFI_PASSWORD = "abcd1234";

// Use your computer's current LAN IP address.
// Use port 5001 if your friend's Express server runs on 5001.
// Use port 5000 if your existing Express server runs on 5000.
const char* SERVER_URL =
  "http://10.245.227.45:5000/api/telemetry/location";

const char* DEVICE_ID = "resqlink-esp32-01";
const char* VEHICLE_NUMBER = "RESQ-VEHICLE-01";

// ==========================================================
// 2. PIN CONFIGURATION
// ==========================================================

// GPS UART1
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define GPS_BAUDRATE 9600

// IMU I2C
#define IMU_SDA_PIN 21
#define IMU_SCL_PIN 22
#define IMU_ADDR 0x68

// Optional onboard LED
#define STATUS_LED_PIN 2

// Set false if your board does not have a usable GPIO2 LED.
#define USE_STATUS_LED true

// Most common ESP32 DevKit onboard GPIO2 LEDs are active HIGH.
// Change this to false if your LED behaves in reverse.
#define LED_ACTIVE_HIGH true

// ==========================================================
// 3. TIMING CONFIGURATION
// ==========================================================

const unsigned long SAMPLE_INTERVAL_MS = 50;
const unsigned long TELEMETRY_INTERVAL_MS = 2000;
const unsigned long SERIAL_INTERVAL_MS = 500;
const unsigned long WIFI_RETRY_INTERVAL_MS = 10000;

// ==========================================================
// 4. ROLLOVER CANDIDATE CONFIGURATION
// ==========================================================

const float TILT_THRESHOLD_DEG = 60.0f;
const float RECOVERY_THRESHOLD_DEG = 35.0f;

const unsigned long TILT_HOLD_MS = 1200;
const unsigned long RECOVERY_HOLD_MS = 2500;

const int CALIBRATION_SAMPLES = 50;

// ==========================================================
// 5. HARDWARE OBJECTS AND GLOBAL VARIABLES
// ==========================================================

// Keep UART1 because this is the configuration
// already used successfully by your GPS code.
HardwareSerial gpsSerial(1);
TinyGPSPlus gps;

// IMU identification and initialization
bool imuInitialized = false;
bool imuReady = false;

bool baselineReady = false;
bool rolloverActive = false;

// Timing
unsigned long lastSampleTime = 0;
unsigned long lastSendTime = 0;
unsigned long lastSerialTime = 0;
unsigned long lastWifiRetryTime = 0;

unsigned long tiltCandidateSince = 0;
unsigned long recoverySince = 0;

// IMU readings
float ax = 0, ay = 0, az = 0;
float gx = 0, gy = 0, gz = 0;

float accelMagnitude = 0;
float tiltDegrees = 0;

// Calibration
int calibrationCount = 0;

float calibrationSumX = 0;
float calibrationSumY = 0;
float calibrationSumZ = 0;

float baselineX = 0;
float baselineY = 0;
float baselineZ = 0;

// ==========================================================
// 6. LED FUNCTION
// ==========================================================

void setStatusLED(bool on) {
  if (!USE_STATUS_LED) return;

  digitalWrite(
    STATUS_LED_PIN,
    LED_ACTIVE_HIGH ? (on ? HIGH : LOW)
                   : (on ? LOW : HIGH)
  );
}

void updateStatusLED() {
  if (!USE_STATUS_LED) return;

  if (WiFi.status() == WL_CONNECTED) {
    setStatusLED(true);
  } else {
    // Blink while Wi-Fi is disconnected.
    setStatusLED((millis() / 500) % 2 == 0);
  }
}

// ==========================================================
// 7. IMU RAW REGISTER FUNCTIONS
// ==========================================================

int16_t combineBytes(uint8_t highByte, uint8_t lowByte) {
  return (int16_t)(
    ((uint16_t)highByte << 8) | lowByte
  );
}

bool readRegister(uint8_t reg, uint8_t &value) {
  Wire.beginTransmission(IMU_ADDR);
  Wire.write(reg);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom((uint8_t)IMU_ADDR,
                       (uint8_t)1) != 1) {
    return false;
  }

  value = Wire.read();
  return true;
}

bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(IMU_ADDR);
  Wire.write(reg);
  Wire.write(value);

  return Wire.endTransmission() == 0;
}

// ==========================================================
// 8. INITIALIZE IMU
// ==========================================================

bool initializeIMU() {
  Wire.begin(IMU_SDA_PIN, IMU_SCL_PIN);
  Wire.setClock(100000);

  uint8_t identity = 0;

  if (!readRegister(0x75, identity)) {
    Serial.println("[IMU] Identity read failed.");
    return false;
  }

  Serial.print("[IMU] WHO_AM_I = 0x");
  Serial.println(identity, HEX);

  // Previously verified sensor identity.
  // 0x68 is also accepted for a conventional MPU6050.
  if (identity != 0x70 && identity != 0x68) {
    Serial.println("[IMU] Unsupported device identity.");
    return false;
  }

  // Wake up sensor
  if (!writeRegister(0x6B, 0x00)) {
    return false;
  }

  delay(100);

  // Accelerometer: ±8g
  if (!writeRegister(0x1C, 0x10)) {
    return false;
  }

  // Gyroscope: ±250 degrees per second
  if (!writeRegister(0x1B, 0x00)) {
    return false;
  }

  Serial.println("[IMU] Sensor initialized successfully.");

  return true;
}

// ==========================================================
// 9. READ IMU DATA
// ==========================================================

bool readIMU() {
  Wire.beginTransmission(IMU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  if (Wire.requestFrom((uint8_t)IMU_ADDR,
                       (uint8_t)14) != 14) {
    return false;
  }

  uint8_t data[14];

  for (int i = 0; i < 14; i++) {
    data[i] = Wire.read();
  }

  int16_t axRaw = combineBytes(data[0], data[1]);
  int16_t ayRaw = combineBytes(data[2], data[3]);
  int16_t azRaw = combineBytes(data[4], data[5]);

  int16_t gxRaw = combineBytes(data[8], data[9]);
  int16_t gyRaw = combineBytes(data[10], data[11]);
  int16_t gzRaw = combineBytes(data[12], data[13]);

  const float gravity = 9.80665f;

  // ±8g accelerometer: 4096 counts per g
  ax = axRaw * gravity / 4096.0f;
  ay = ayRaw * gravity / 4096.0f;
  az = azRaw * gravity / 4096.0f;

  // ±250 dps gyroscope: 131 counts per degree/second
  gx = gxRaw / 131.0f;
  gy = gyRaw / 131.0f;
  gz = gzRaw / 131.0f;

  accelMagnitude = sqrtf(
    ax * ax + ay * ay + az * az
  );

  return true;
}

// ==========================================================
// 10. CALIBRATION AND TILT CALCULATION
// ==========================================================

float calculateTiltDegrees() {
  float baselineMagnitude = sqrtf(
    baselineX * baselineX +
    baselineY * baselineY +
    baselineZ * baselineZ
  );

  if (baselineMagnitude < 1.0f ||
      accelMagnitude < 1.0f) {
    return 0.0f;
  }

  float dotProduct =
    baselineX * ax +
    baselineY * ay +
    baselineZ * az;

  float cosine = dotProduct /
    (baselineMagnitude * accelMagnitude);

  cosine = constrain(cosine, -1.0f, 1.0f);

  return acosf(cosine) * 180.0f / PI;
}

void updateRolloverDetector() {
  unsigned long now = millis();

  // Capture normal mounting orientation at startup.
  if (!baselineReady) {

    // Only calibrate when gravity magnitude is plausible.
    // This helps avoid calibrating during a large movement.
    if (accelMagnitude >= 7.5f &&
        accelMagnitude <= 12.5f) {

      calibrationSumX += ax;
      calibrationSumY += ay;
      calibrationSumZ += az;

      calibrationCount++;

    } else {
      calibrationCount = 0;

      calibrationSumX = 0;
      calibrationSumY = 0;
      calibrationSumZ = 0;
    }

    if (calibrationCount >= CALIBRATION_SAMPLES) {
      baselineX = calibrationSumX / calibrationCount;
      baselineY = calibrationSumY / calibrationCount;
      baselineZ = calibrationSumZ / calibrationCount;

      baselineReady = true;

      Serial.println("[IMU] Calibration complete.");
      Serial.println("[IMU] Normal vehicle orientation recorded.");
    }

    return;
  }

  tiltDegrees = calculateTiltDegrees();

  // Trigger a candidate only after a sustained tilt.
  if (!rolloverActive) {

    if (tiltDegrees >= TILT_THRESHOLD_DEG) {

      if (tiltCandidateSince == 0) {
        tiltCandidateSince = now;
      }

      if (now - tiltCandidateSince >= TILT_HOLD_MS) {

        rolloverActive = true;
        recoverySince = 0;

        Serial.println(
          "[ALERT] ROLLOVER_CANDIDATE"
        );
      }

    } else {
      tiltCandidateSince = 0;
    }

  } else {

    // Clear candidate only after returning to
    // the calibrated position for a sustained period.
    if (tiltDegrees <= RECOVERY_THRESHOLD_DEG) {

      if (recoverySince == 0) {
        recoverySince = now;
      }

      if (now - recoverySince >= RECOVERY_HOLD_MS) {

        rolloverActive = false;
        tiltCandidateSince = 0;
        recoverySince = 0;

        Serial.println("[IMU] Candidate status cleared.");
      }

    } else {
      recoverySince = 0;
    }
  }
}

const char* getEventType() {
  if (!imuInitialized) return "IMU_ERROR";
  if (!baselineReady) return "CALIBRATING";
  if (!imuReady) return "IMU_ERROR";
  if (rolloverActive) return "ROLLOVER_CANDIDATE";

  return "NORMAL";
}

// ==========================================================
// 11. WIFI CONNECTION
// ==========================================================

void connectToWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  lastWifiRetryTime = millis();

  Serial.println("[WiFi] Connecting...");

  Serial.print("[WiFi] SSID: ");
  Serial.println(WIFI_SSID);
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();

  if (now - lastWifiRetryTime >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiRetryTime = now;

    Serial.println("[WiFi] Reconnecting...");
    WiFi.reconnect();
  }
}

// ==========================================================
// 12. SEND TELEMETRY TO EXPRESS BACKEND
// ==========================================================

void postTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Wi-Fi unavailable.");
    return;
  }

  bool gpsFix =
    gps.location.isValid() &&
    gps.location.age() < 5000;

  unsigned int satellites =
    gps.satellites.isValid()
      ? gps.satellites.value()
      : 0;

  double latitude = gpsFix
    ? gps.location.lat()
    : 0.0;

  double longitude = gpsFix
    ? gps.location.lng()
    : 0.0;

  float speedKmph =
    gpsFix && gps.speed.isValid()
      ? gps.speed.kmph()
      : 0.0f;

  // Construct JSON.
  // Field names match the earlier ResQLink API format.

  String payload = "{";

  payload += "\"deviceId\":\"";
  payload += DEVICE_ID;
  payload += "\",";

  payload += "\"vehicleNumber\":\"";
  payload += VEHICLE_NUMBER;
  payload += "\",";

  payload += "\"gpsFix\":";
  payload += gpsFix ? "true" : "false";
  payload += ",";

  payload += "\"latitude\":";
  payload += gpsFix
    ? String(latitude, 6)
    : String("null");
  payload += ",";

  payload += "\"longitude\":";
  payload += gpsFix
    ? String(longitude, 6)
    : String("null");
  payload += ",";

  payload += "\"satellites\":";
  payload += String(satellites);
  payload += ",";

  payload += "\"speedKmph\":";
  payload += String(speedKmph, 2);
  payload += ",";

  payload += "\"imuReady\":";
  payload += imuReady ? "true" : "false";
  payload += ",";

  payload += "\"ax\":";
  payload += imuReady ? String(ax, 3) : String("null");
  payload += ",\"ay\":";
  payload += imuReady ? String(ay, 3) : String("null");
  payload += ",\"az\":";
  payload += imuReady ? String(az, 3) : String("null");

  payload += ",\"gx\":";
  payload += imuReady ? String(gx, 3) : String("null");
  payload += ",\"gy\":";
  payload += imuReady ? String(gy, 3) : String("null");
  payload += ",\"gz\":";
  payload += imuReady ? String(gz, 3) : String("null");

  payload += ",\"accelMagnitude\":";
  payload += imuReady
    ? String(accelMagnitude, 3)
    : String("null");

  payload += ",\"tiltDeg\":";
  payload += (imuReady && baselineReady)
    ? String(tiltDegrees, 2)
    : String("null");

  payload += ",\"eventType\":\"";
  payload += getEventType();
  payload += "\"";

  payload += "}";

  WiFiClient client;
  HTTPClient http;

  if (!http.begin(client, SERVER_URL)) {
    Serial.println("[HTTP] Client initialization failed.");
    return;
  }

  http.setConnectTimeout(1000);
  http.setTimeout(1500);

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  int httpCode = http.POST(payload);

  if (httpCode >= 200 && httpCode < 300) {

    Serial.print("[HTTP] Telemetry sent: ");
    Serial.println(httpCode);

  } else {

    Serial.print("[HTTP] Request failed: ");
    Serial.println(httpCode);

    if (httpCode < 0) {
      Serial.println(http.errorToString(httpCode));
    }
  }

  http.end();
}

// ==========================================================
// 13. SERIAL MONITOR OUTPUT
// ==========================================================

void printTelemetry() {
  bool gpsFix =
    gps.location.isValid() &&
    gps.location.age() < 5000;

  Serial.println("\n========== RESQLINK ==========");

  Serial.print("Device: ");
  Serial.println(DEVICE_ID);

  Serial.print("Vehicle: ");
  Serial.println(VEHICLE_NUMBER);

  Serial.print("GPS Fix: ");
  Serial.println(gpsFix ? "YES" : "NO");

  if (gpsFix) {
    Serial.print("Latitude: ");
    Serial.println(gps.location.lat(), 6);

    Serial.print("Longitude: ");
    Serial.println(gps.location.lng(), 6);
  }

  Serial.print("Satellites: ");
  Serial.println(
    gps.satellites.isValid()
      ? gps.satellites.value()
      : 0
  );

  Serial.print("Speed: ");
  Serial.print(gps.speed.isValid() ? gps.speed.kmph() : 0.0);
  Serial.println(" km/h");

  Serial.print("IMU: ");
  Serial.println(imuReady ? "ONLINE" : "ERROR");

  if (imuReady) {
    Serial.print("AX: "); Serial.print(ax, 2);
    Serial.print(" AY: "); Serial.print(ay, 2);
    Serial.print(" AZ: "); Serial.println(az, 2);

    Serial.print("GX: "); Serial.print(gx, 2);
    Serial.print(" GY: "); Serial.print(gy, 2);
    Serial.print(" GZ: "); Serial.println(gz, 2);

    Serial.print("Acceleration magnitude: ");
    Serial.println(accelMagnitude, 2);

    Serial.print("Tilt angle: ");
    if (baselineReady) {
      Serial.print(tiltDegrees, 1);
      Serial.println(" degrees");
    } else {
      Serial.println("CALIBRATING");
    }
  }

  Serial.print("Event: ");
  Serial.println(getEventType());

  Serial.print("Wi-Fi: ");
  Serial.println(
    WiFi.status() == WL_CONNECTED
      ? "CONNECTED"
      : "DISCONNECTED"
  );

  Serial.println("==============================");
}

// ==========================================================
// 14. SETUP
// ==========================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  if (USE_STATUS_LED) {
    pinMode(STATUS_LED_PIN, OUTPUT);
    setStatusLED(false);
  }

  Serial.println("\n========================================");
  Serial.println(" RESQLINK VEHICLE SAFETY SYSTEM");
  Serial.println(" GPS + IMU + WIFI TELEMETRY");
  Serial.println("========================================");

  // GPS initialization
  gpsSerial.begin(
    GPS_BAUDRATE,
    SERIAL_8N1,
    GPS_RX_PIN,
    GPS_TX_PIN
  );

  Serial.println("[GPS] UART1 initialized on GPIO 16/17.");

  // IMU initialization
  imuInitialized = initializeIMU();
  imuReady = imuInitialized;

  if (!imuInitialized) {
    Serial.println("[IMU] Continuing with GPS only.");
  }

  // Start Wi-Fi without blocking sensor acquisition.
  connectToWiFi();

  Serial.println("[SYSTEM] Initialization complete.");
}

// ==========================================================
// 15. MAIN LOOP
// ==========================================================

void loop() {
  // Always process GPS data.
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  unsigned long now = millis();

  // Sample IMU at 20 Hz.
  if (now - lastSampleTime >= SAMPLE_INTERVAL_MS) {

    lastSampleTime = now;

    if (imuInitialized && readIMU()) {
      imuReady = true;
      updateRolloverDetector();

    } else if (imuInitialized) {
      imuReady = false;
    }
  }

  // Wi-Fi maintenance.
  maintainWiFi();
  updateStatusLED();

  // Serial debugging.
  if (now - lastSerialTime >= SERIAL_INTERVAL_MS) {
    lastSerialTime = now;
    printTelemetry();
  }

  // Send telemetry.
  if (now - lastSendTime >= TELEMETRY_INTERVAL_MS) {
    lastSendTime = now;
    postTelemetry();
  }
}

