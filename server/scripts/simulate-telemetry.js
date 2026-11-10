/**
 * Telemetry Stream Simulator for ResQLink
 * Simulates real-time telemetry from an ESP32 unit with GPS and IMU sensors.
 *
 * Usage:
 *   npm run simulate             # Normal driving simulation
 *   npm run simulate:rollover    # Simulates a rollover event after 5 seconds
 */

const API_URL = process.env.API_URL || "http://localhost:5000/api/telemetry/location";
const isRolloverMode = process.argv.includes("--rollover");

let lat = 12.971598;
let lng = 77.594566;
let speed = 40.0;
let step = 0;

console.log("==================================================");
console.log(` ResQLink ESP32 Telemetry Simulator`);
console.log(` Target: ${API_URL}`);
console.log(` Mode:   ${isRolloverMode ? "ROLLOVER TEST (triggers tilt after 5s)" : "NORMAL DRIVING"}`);
console.log(" Press Ctrl+C to stop.");
console.log("==================================================\n");

async function sendPacket() {
  step++;

  // Drift coordinates slightly to simulate movement
  lat += (Math.random() - 0.4) * 0.0003;
  lng += (Math.random() - 0.4) * 0.0003;
  speed = Math.max(10, Math.min(80, speed + (Math.random() - 0.5) * 5));

  // Determine if this step triggers a rollover candidate
  const triggerRollover = isRolloverMode && step >= 5 && step <= 9;
  const eventType = triggerRollover ? "ROLLOVER_CANDIDATE" : "NORMAL";
  const tiltDeg = triggerRollover ? 68.5 + Math.random() * 5 : 8.0 + Math.random() * 4;

  const payload = {
    deviceId: "resqlink-esp32-01",
    vehicleNumber: "RESQ-VEHICLE-01",
    gpsFix: true,
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    satellites: 9,
    speedKmph: Number(speed.toFixed(1)),
    imuReady: true,
    ax: Number(((Math.random() - 0.5) * 2).toFixed(2)),
    ay: Number(((Math.random() - 0.5) * 2).toFixed(2)),
    az: Number((9.8 + (Math.random() - 0.5)).toFixed(2)),
    gx: 0.01,
    gy: 0.02,
    gz: -0.01,
    accelMagnitude: Number((9.8 + (Math.random() - 0.5) * 0.2).toFixed(2)),
    tiltDeg: Number(tiltDeg.toFixed(1)),
    eventType
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Server returned HTTP ${res.status}: ${text.slice(0, 80)}`);
    }

    const time = new Date().toLocaleTimeString();
    if (res.ok) {
      console.log(
        `[${time}] Packet #${step} sent | Speed: ${payload.speedKmph} km/h | Tilt: ${payload.tiltDeg}° | Event: ${payload.eventType} | MongoDB: Updated`
      );
    } else {
      console.error(`[${time}] Error (${res.status}):`, data.message || text);
    }
  } catch (err) {
    console.error(`[Error] Could not reach ${API_URL}:`, err.message);
  }
}

// Send initial packet immediately, then every 2 seconds
sendPacket();
const interval = setInterval(sendPacket, 2000);

process.on("SIGINT", () => {
  clearInterval(interval);
  console.log("\nSimulator stopped.");
  process.exit(0);
});
