import twilio from "twilio";

let twilioClient = null;

function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!twilioClient) {
    const isPlaceholder =
      !sid ||
      !token ||
      sid.includes("XXXX") ||
      token.includes("your_twilio") ||
      !sid.startsWith("AC");

    if (!isPlaceholder) {
      twilioClient = twilio(sid, token);
    }
  }
  return twilioClient;
}

/**
 * Builds dynamic TwiML XML speech payload for the emergency call
 */
export function buildEmergencyTwiML({ vehicleNumber, latitude, longitude, address }) {
  const latText = Number.isFinite(latitude) ? latitude.toFixed(4) : "unknown";
  const lngText = Number.isFinite(longitude) ? longitude.toFixed(4) : "unknown";
  const locationPhrase = address
    ? `near ${address}, coordinates latitude ${latText}, longitude ${lngText}`
    : `at latitude ${latText}, longitude ${lngText}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="alice" language="en-US">
    Emergency alert from ResQLink vehicle safety system.
    An accident candidate has been detected for vehicle ${vehicleNumber || "RESQ-VEHICLE-01"}.
    Location is ${locationPhrase}.
    Immediate emergency and medical assistance may be required.
    Repeating: Vehicle ${vehicleNumber || "RESQ-VEHICLE-01"}, emergency detected ${locationPhrase}.
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-US">Ending emergency broadcast.</Say>
</Response>`.trim();
}

/**
 * Initiates an outbound Twilio Voice call with dynamic TwiML
 */
export async function makeEmergencyVoiceCall({
  to,
  vehicleNumber = "RESQ-VEHICLE-01",
  latitude,
  longitude,
  address = ""
}) {
  const client = getTwilioClient();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const twiml = buildEmergencyTwiML({ vehicleNumber, latitude, longitude, address });

  // If Twilio credentials are placeholders or not configured, simulate gracefully
  const isPlaceholderFrom = !fromNumber || fromNumber.includes("1234567890");
  if (!client || isPlaceholderFrom) {
    console.warn(
      "[Twilio] Placeholder credentials detected. Simulating outbound voice call for testing."
    );
    return {
      simulated: true,
      callSid: `SIM_${Date.now()}`,
      status: "SIMULATED",
      to,
      from: fromNumber || "+15005550006",
      twiml
    };
  }

  try {
    const call = await client.calls.create({
      twiml,
      to,
      from: fromNumber
    });

    console.log(`[Twilio] Outbound voice call initiated: CallSid ${call.sid} -> ${to}`);
    return {
      simulated: false,
      callSid: call.sid,
      status: call.status,
      to,
      from: fromNumber,
      twiml
    };
  } catch (error) {
    console.error(`[Twilio Error] Failed to place voice call: ${error.message}`);
    throw error;
  }
}

export default {
  buildEmergencyTwiML,
  makeEmergencyVoiceCall
};
