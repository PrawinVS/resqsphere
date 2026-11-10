/**
 * ResQLink — ESP32 Vehicle Safety & Telemetry Firmware
 *
 * Hardware Components:
 *   - ESP32 DevKit V1
 *   - NEO-6M GPS Module (UART Serial2: RX=16, TX=17)
 *   - MPU6050 / MPU6500 IMU (I2C: SDA=21, SCL=22)
 *   - Status LED (GPIO 2 / Builtin)
 *
 * Libraries Required (Install via Arduino Library Manager):
 *   - TinyGPSPlus (by Mikal Hart)
 *   - Adafruit MPU6050 (by Adafruit)
 *   - Adafruit Unified Sensor
 *   - ArduinoJson (by Benoit Blanchon, v6 or v7)
 *   - WiFi & HTTPClient (built-in ESP32 core)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <TinyGPSPlus.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <ArduinoJson.h>

// ==========================================
// Network & Server Configuration
// ==========================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Replace with your computer's local IP address (e.g., "http://192.168.1.50:5001/api/telemetry/location")
const char* SERVER_URL    = "http://192.168.1.100:5001/api/telemetry/location";

// Device Identifiers
const char* DEVICE_ID      = "resqlink-esp32-01";
const char* VEHICLE_NUMBER = "RESQ-VEHICLE-01";

// ==========================================
// Pin Definitions
// ==========================================
#define GPS_RX_PIN 16     // ESP32 RX2 connects to GPS TX
#define GPS_TX_PIN 17     // ESP32 TX2 connects to GPS RX
#define GPS_BAUDRATE 9600
#define STATUS_LED_PIN 2

// IMU Tilt Thresholds
const float TILT_ROLLOVER_THRESHOLD_DEG = 60.0; // Angle threshold triggering rollover candidate
const unsigned long TELEMETRY_INTERVAL_MS = 2000; // Send telemetry every 2 seconds

// ==========================================
// Hardware Instances
// ==========================================
HardwareSerial gpsSerial(2);
TinyGPSPlus gps;
Adafruit_MPU6050 mpu;

bool imuReady = false;
unsigned long lastSendTime = 0;

// ==========================================
// Helper Functions
// ==========================================

void connectToWiFi() {
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    digitalWrite(STATUS_LED_PIN, !digitalRead(STATUS_LED_PIN));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected successfully!");
    Serial.print("[WiFi] ESP32 IP Address: ");
    Serial.println(WiFi.localIP());
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    Serial.println("\n[WiFi] Connection failed. Will retry in loop.");
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

void initSensors() {
  // Initialize GPS Serial
  gpsSerial.begin(GPS_BAUDRATE, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[GPS] NEO-6M Serial2 initialized.");

  // Initialize I2C for MPU6050
  Wire.begin(21, 22);
  if (mpu.begin(0x68, &Wire)) {
    Serial.println("[IMU] MPU6050 initialized.");
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setGyroRange(MPU6050_RANGE_500_DEG);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
    imuReady = true;
  } else {
    Serial.println("[IMU] Warning: MPU6050 not detected at 0x68. Checking 0x69...");
    if (mpu.begin(0x69, &Wire)) {
      Serial.println("[IMU] MPU6050 found at 0x69.");
      imuReady = true;
    } else {
      Serial.println("[IMU] Error: MPU6050 not found. Continuing with GPS only.");
      imuReady = false;
    }
  }
}

void readAndSendTelemetry() {
  // 1. Read IMU Data
  sensors_event_t a, g, temp;
  float ax = 0.0, ay = 0.0, az = 9.81;
  float gx = 0.0, gy = 0.0, gz = 0.0;
  float accelMag = 9.81;
  float tiltDeg = 0.0;
  String eventType = "NORMAL";

  if (imuReady) {
    mpu.getEvent(&a, &g, &temp);
    ax = a.acceleration.x;
    ay = a.acceleration.y;
    az = a.acceleration.z;
    gx = g.gyro.x * 57.2958; // Convert rad/s to deg/s
    gy = g.gyro.y * 57.2958;
    gz = g.gyro.z * 57.2958;

    accelMag = sqrt(ax * ax + ay * ay + az * az);

    // Calculate vertical tilt angle relative to gravity vector
    if (accelMag > 0.1) {
      float cosAngle = az / accelMag;
      if (cosAngle > 1.0) cosAngle = 1.0;
      if (cosAngle < -1.0) cosAngle = -1.0;
      tiltDeg = acos(cosAngle) * 57.2958; // Convert to degrees
    }

    // Check for rollover candidate threshold
    if (tiltDeg >= TILT_ROLLOVER_THRESHOLD_DEG) {
      eventType = "ROLLOVER_CANDIDATE";
    }
  }

  // 2. Read GPS Data
  bool gpsFix = gps.location.isValid() && gps.location.age() < 5000;
  double latitude = gpsFix ? gps.location.lat() : 0.0;
  double longitude = gpsFix ? gps.location.lng() : 0.0;
  int satellites = gps.satellites.isValid() ? gps.satellites.value() : 0;
  float speedKmph = gps.speed.isValid() ? gps.speed.kmph() : 0.0;

  // 3. Construct JSON Payload
  StaticJsonDocument<512> doc;
  doc["deviceId"] = DEVICE_ID;
  doc["vehicleNumber"] = VEHICLE_NUMBER;
  doc["gpsFix"] = gpsFix;
  if (gpsFix) {
    doc["latitude"] = latitude;
    doc["longitude"] = longitude;
  } else {
    doc["latitude"] = nullptr;
    doc["longitude"] = nullptr;
  }
  doc["satellites"] = satellites;
  doc["speedKmph"] = speedKmph;
  doc["imuReady"] = imuReady;

  if (imuReady) {
    doc["ax"] = round(ax * 100.0) / 100.0;
    doc["ay"] = round(ay * 100.0) / 100.0;
    doc["az"] = round(az * 100.0) / 100.0;
    doc["gx"] = round(gx * 100.0) / 100.0;
    doc["gy"] = round(gy * 100.0) / 100.0;
    doc["gz"] = round(gz * 100.0) / 100.0;
    doc["accelMagnitude"] = round(accelMag * 100.0) / 100.0;
    doc["tiltDeg"] = round(tiltDeg * 10.0) / 10.0;
  } else {
    doc["ax"] = nullptr;
    doc["ay"] = nullptr;
    doc["az"] = nullptr;
    doc["gx"] = nullptr;
    doc["gy"] = nullptr;
    doc["gz"] = nullptr;
    doc["accelMagnitude"] = nullptr;
    doc["tiltDeg"] = nullptr;
  }

  doc["eventType"] = eventType;

  String jsonString;
  serializeJson(doc, jsonString);

  // 4. Send HTTP POST to Express Backend
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(jsonString);

    if (httpCode == HTTP_CODE_OK || httpCode == HTTP_CODE_CREATED) {
      Serial.printf("[HTTP] POST OK (%d) | Tilt: %.1f deg | Event: %s | Fix: %s\n",
                    httpCode, tiltDeg, eventType.c_str(), gpsFix ? "YES" : "NO");
    } else {
      Serial.printf("[HTTP] POST Failed, code: %d | Error: %s\n",
                    httpCode, http.errorToString(httpCode).c_str());
    }

    http.end();
  } else {
    Serial.println("[WiFi] Lost connection. Reconnecting...");
    WiFi.reconnect();
  }
}

// ==========================================
// Setup & Main Loop
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  Serial.println("\n==========================================");
  Serial.println("  ResQLink ESP32 Vehicle Safety System");
  Serial.println("==========================================");

  initSensors();
  connectToWiFi();
}

void loop() {
  // Feed GPS parser with incoming serial bytes
  while (gpsSerial.available() > 0) {
    gps.encode(gpsSerial.read());
  }

  // Periodic telemetry transmission
  unsigned long now = millis();
  if (now - lastSendTime >= TELEMETRY_INTERVAL_MS) {
    lastSendTime = now;
    readAndSendTelemetry();
  }
}

