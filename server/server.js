
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN =
  process.env.CLIENT_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "100kb" }));

// Temporary prototype storage. Replace with MongoDB later.
let latestLocation = null;
let previousEventType = "NORMAL";
const accidentLogs = [];
const emergencyContacts = [];

const EVENT_TYPES = [
  "CALIBRATING",
  "NORMAL",
  "ROLLOVER_CANDIDATE"
];

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validCoordinates(body) {
  return (
    isFiniteNumber(body.latitude) &&
    isFiniteNumber(body.longitude) &&
    body.latitude >= -90 &&
    body.latitude <= 90 &&
    body.longitude >= -180 &&
    body.longitude <= 180
  );
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "ResQLink API",
    storage: "in-memory prototype"
  });
});

// Receive the combined GPS + IMU telemetry from ESP32.
app.post("/api/telemetry/location", (req, res) => {
  const body = req.body ?? {};
  const gpsFix = body.gpsFix === true;
  const eventType = EVENT_TYPES.includes(body.eventType)
    ? body.eventType
    : "NORMAL";

  if (gpsFix && !validCoordinates(body)) {
    return res.status(400).json({
      success: false,
      message: "Invalid GPS coordinates"
    });
  }

  const now = new Date().toISOString();

  latestLocation = {
    deviceId: String(body.deviceId || "resqlink-esp32-01"),
    vehicleNumber: String(
      body.vehicleNumber || "RESQ-VEHICLE-01"
    ),
    gpsFix,
    latitude: gpsFix ? body.latitude : null,
    longitude: gpsFix ? body.longitude : null,
    satellites: Number.isFinite(body.satellites)
      ? body.satellites
      : 0,
    speedKmph: Number.isFinite(body.speedKmph)
      ? body.speedKmph
      : 0,
    imuReady: body.imuReady === true,
    ax: Number.isFinite(body.ax) ? body.ax : null,
    ay: Number.isFinite(body.ay) ? body.ay : null,
    az: Number.isFinite(body.az) ? body.az : null,
    gx: Number.isFinite(body.gx) ? body.gx : null,
    gy: Number.isFinite(body.gy) ? body.gy : null,
    gz: Number.isFinite(body.gz) ? body.gz : null,
    accelMagnitude: Number.isFinite(body.accelMagnitude)
      ? body.accelMagnitude
      : null,
    tiltDeg: Number.isFinite(body.tiltDeg)
      ? body.tiltDeg
      : null,
    eventType,
    updatedAt: now
  };

  const isCandidate = eventType === "ROLLOVER_CANDIDATE";

  // Create one log entry when a candidate event begins.
  // Repeated telemetry during the same event won't duplicate it.
  if (isCandidate && previousEventType !== eventType) {
    accidentLogs.unshift({
      id: randomUUID(),
      deviceId: latestLocation.deviceId,
      vehicleNumber: latestLocation.vehicleNumber,
      eventType,
      status: "CANDIDATE — verify",
      timestamp: now,
      latitude: latestLocation.latitude,
      longitude: latestLocation.longitude,
      gpsFix: latestLocation.gpsFix,
      tiltDeg: latestLocation.tiltDeg,
      note: "Tilt threshold triggered; prototype event, not a confirmed crash."
    });

    if (accidentLogs.length > 100) {
      accidentLogs.pop();
    }
  }

  previousEventType = isCandidate ? eventType : "NORMAL";

  res.status(200).json({
    success: true,
    message: "Telemetry received",
    location: latestLocation
  });
});

app.get("/api/telemetry/latest", (req, res) => {
  res.json({ location: latestLocation });
});

app.get("/api/accidents", (req, res) => {
  res.json({ accidents: accidentLogs });
});

app.get("/api/contacts", (req, res) => {
  res.json({ contacts: emergencyContacts });
});

app.post("/api/contacts", (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const relationship = String(
    req.body?.relationship ?? ""
  ).trim();
  const phone = String(req.body?.phone ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({
      message: "Enter a contact name between 2 and 80 characters."
    });
  }

  if (!/^[+0-9() -]{7,20}$/.test(phone)) {
    return res.status(400).json({
      message: "Enter a valid phone number."
    });
  }

  const contact = {
    id: randomUUID(),
    name,
    relationship: relationship || "Emergency contact",
    phone,
    createdAt: new Date().toISOString()
  };

  emergencyContacts.push(contact);

  res.status(201).json({
    success: true,
    contact
  });
});

app.delete("/api/contacts/:id", (req, res) => {
  const index = emergencyContacts.findIndex(
    (contact) => contact.id === req.params.id
  );

  if (index === -1) {
    return res.status(404).json({
      message: "Contact not found."
    });
  }

  emergencyContacts.splice(index, 1);
  res.json({ success: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ResQLink API running on port ${PORT}`);
});
