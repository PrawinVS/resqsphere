import AccidentLog from "../models/AccidentLog.js";
import Contact from "../models/Contact.js";
import { makeEmergencyVoiceCall } from "../services/twilioService.js";

export async function getAccidents(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const accidents = await AccidentLog.find()
      .sort({ timestamp: -1 })
      .limit(limit);

    return res.json({ accidents });
  } catch (error) {
    next(error);
  }
}

export async function clearAccidents(req, res, next) {
  try {
    await AccidentLog.deleteMany({});
    return res.json({ success: true, message: "Accident logs cleared" });
  } catch (error) {
    next(error);
  }
}

export async function reportAccidentWithVoiceCall(req, res, next) {
  try {
    const body = req.body ?? {};

    // 1. Extract location coordinates
    const location = body.location ?? {};
    const latitude = Number.isFinite(location.latitude)
      ? location.latitude
      : Number.isFinite(body.latitude)
        ? body.latitude
        : null;

    const longitude = Number.isFinite(location.longitude)
      ? location.longitude
      : Number.isFinite(body.longitude)
        ? body.longitude
        : null;

    const address = location.address || body.address || "";
    const tiltDeg = Number.isFinite(body.tiltDeg) ? body.tiltDeg : null;
    const deviceId = String(body.deviceId || "resqlink-esp32-01").trim();
    const vehicleNumber = String(body.vehicleNumber || "RESQ-VEHICLE-01").trim();
    const eventType = body.eventType || "ROLLOVER_CANDIDATE";

    // 2. Resolve target emergency contact
    let contact = body.emergencyContact;
    if (!contact || !contact.phone) {
      // Fallback: look up primary contact from MongoDB
      const savedContact = await Contact.findOne().sort({ createdAt: 1 });
      if (savedContact) {
        contact = {
          name: savedContact.name,
          phone: savedContact.phone
        };
      }
    }

    if (!contact || !contact.phone) {
      return res.status(400).json({
        success: false,
        message:
          "Emergency contact phone number is required (pass emergencyContact in body or add a contact in database)."
      });
    }

    // 3. Trigger Twilio Voice Call with dynamic TwiML
    let callResult = null;
    try {
      callResult = await makeEmergencyVoiceCall({
        to: contact.phone,
        vehicleNumber,
        latitude,
        longitude,
        address
      });
    } catch (callError) {
      console.error("[Twilio Dispatch Error]", callError.message);
      callResult = {
        simulated: false,
        callSid: null,
        status: "FAILED",
        error: callError.message
      };
    }

    // 4. Save incident to MongoDB with call tracking details
    const accident = await AccidentLog.create({
      deviceId,
      vehicleNumber,
      eventType,
      status: callResult?.status === "FAILED" ? "ALERT_FAILED" : "ALERT_DISPATCHED",
      timestamp: new Date(),
      latitude,
      longitude,
      gpsFix: latitude !== null && longitude !== null,
      tiltDeg,
      note: body.note || "Emergency incident reported; Twilio voice alert triggered.",
      callSid: callResult?.callSid || null,
      callStatus: callResult?.status || "FAILED",
      emergencyContactCalled: {
        name: contact.name || "Emergency Contact",
        phone: contact.phone
      },
      voiceMessage: callResult?.twiml || null
    });

    return res.status(201).json({
      success: true,
      message: "Accident logged to MongoDB and Twilio voice alert initiated.",
      accident: accident.toJSON(),
      call: callResult
    });
  } catch (error) {
    next(error);
  }
}
