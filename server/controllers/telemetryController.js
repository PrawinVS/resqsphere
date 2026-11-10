import Device from "../models/Device.js";
import Telemetry from "../models/Telemetry.js";
import AccidentLog from "../models/AccidentLog.js";

const EVENT_TYPES = ["CALIBRATING", "NORMAL", "ROLLOVER_CANDIDATE"];

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

export async function receiveTelemetry(req, res, next) {
  try {
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

    const deviceId = String(body.deviceId || "resqlink-esp32-01").trim();
    const existingDevice = await Device.findOne({ deviceId });
    const prevEventType = existingDevice?.previousEventType || "NORMAL";

    const now = new Date();

    const telemetryData = {
      deviceId,
      vehicleNumber: String(body.vehicleNumber || "RESQ-VEHICLE-01").trim(),
      gpsFix,
      latitude: gpsFix ? body.latitude : null,
      longitude: gpsFix ? body.longitude : null,
      satellites: Number.isFinite(body.satellites) ? body.satellites : 0,
      speedKmph: Number.isFinite(body.speedKmph) ? body.speedKmph : 0,
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
      tiltDeg: Number.isFinite(body.tiltDeg) ? body.tiltDeg : null,
      eventType,
      updatedAt: now
    };

    const isCandidate = eventType === "ROLLOVER_CANDIDATE";

    // Create an accident record in MongoDB when candidate event begins
    if (isCandidate && prevEventType !== eventType) {
      await AccidentLog.create({
        deviceId: telemetryData.deviceId,
        vehicleNumber: telemetryData.vehicleNumber,
        eventType,
        status: "CANDIDATE — verify",
        timestamp: now,
        latitude: telemetryData.latitude,
        longitude: telemetryData.longitude,
        gpsFix: telemetryData.gpsFix,
        tiltDeg: telemetryData.tiltDeg,
        note: "Tilt threshold triggered; prototype event, not a confirmed crash."
      });
    }

    const nextPreviousEventType = isCandidate ? eventType : "NORMAL";

    // Persist latest state in MongoDB (Device digital twin)
    const updatedDevice = await Device.findOneAndUpdate(
      { deviceId },
      {
        ...telemetryData,
        previousEventType: nextPreviousEventType
      },
      { returnDocument: "after", upsert: true, setDefaultsOnInsert: true }
    );

    // Persist time-series telemetry point in MongoDB
    await Telemetry.create({
      ...telemetryData,
      timestamp: now
    });

    return res.status(200).json({
      success: true,
      message: "Telemetry received",
      location: updatedDevice.toJSON()
    });
  } catch (error) {
    next(error);
  }
}

export async function getLatestTelemetry(req, res, next) {
  try {
    const device = await Device.findOne().sort({ updatedAt: -1 });
    return res.json({ location: device ? device.toJSON() : null });
  } catch (error) {
    next(error);
  }
}

export async function getTelemetryHistory(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const history = await Telemetry.find()
      .sort({ timestamp: -1 })
      .limit(limit);

    return res.json({ history });
  } catch (error) {
    next(error);
  }
}
