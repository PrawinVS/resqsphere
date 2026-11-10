/**
 * Local Automation Test Script: Accident Alert & Twilio Voice Call Integration
 *
 * Usage:
 *   node scripts/test-accident.js
 *   (or: npm run test:accident)
 */

import dotenv from "dotenv";
dotenv.config();

const PORT = process.env.PORT || 5001;
const BASE_URL = `http://localhost:${PORT}`;

async function runAccidentTest() {
  console.log("==================================================");
  console.log(" Testing Accident Reporting & Twilio Voice Alert");
  console.log(` Target Server: ${BASE_URL}`);
  console.log("==================================================\n");

  const mockPayload = {
    deviceId: "resqlink-esp32-01",
    vehicleNumber: "RESQ-VEHICLE-01",
    eventType: "ROLLOVER_CANDIDATE",
    tiltDeg: 74.2,
    location: {
      latitude: 12.971598,
      longitude: 77.594566,
      address: "MG Road Junction, Bangalore"
    },
    emergencyContact: {
      name: "Highway Patrol Dispatch",
      phone: "+919876543210"
    },
    note: "Automated bench simulation test: vehicle rollover threshold crossed."
  };

  console.log("1. Sending mock accident payload to POST /api/accidents/report...");
  console.log("Payload:", JSON.stringify(mockPayload, null, 2));

  try {
    const res = await fetch(`${BASE_URL}/api/accidents/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mockPayload)
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("\n❌ Server returned error status:", res.status);
      console.error("Response message:", data.message || data);
      process.exit(1);
    }

    console.log("\n✅ Server response received successfully (HTTP 201 Created):");
    console.log(JSON.stringify(data, null, 2));

    // 2. Verification checks
    console.log("\n2. Verifying MongoDB write and Twilio dispatch...");

    const accidentId = data.accident?.id;
    if (!accidentId) {
      throw new Error("Accident document ID was not returned by MongoDB.");
    }
    console.log(`   [PASS] MongoDB record created with ID: ${accidentId}`);

    const callSid = data.call?.callSid;
    const callStatus = data.call?.status;
    if (!callSid) {
      throw new Error("Twilio CallSid missing from response.");
    }
    console.log(`   [PASS] Twilio Call initiated (CallSid: ${callSid}, Status: ${callStatus})`);

    // 3. Query MongoDB GET /api/accidents to confirm persistence
    console.log("\n3. Verifying persistence via GET /api/accidents...");
    const getRes = await fetch(`${BASE_URL}/api/accidents`);
    const getData = await getRes.json();
    const found = (getData.accidents || []).find((a) => a.id === accidentId);

    if (!found) {
      throw new Error(`Incident with ID ${accidentId} was not found in MongoDB.`);
    }

    console.log(`   [PASS] Incident successfully retrieved from MongoDB:`);
    console.log(`          - Status:     ${found.status}`);
    console.log(`          - CallSid:    ${found.callSid}`);
    console.log(`          - Contact:    ${found.emergencyContactCalled?.name} (${found.emergencyContactCalled?.phone})`);
    console.log(`          - Latitude:   ${found.latitude}`);
    console.log(`          - Longitude:  ${found.longitude}`);

    console.log("\n==================================================");
    console.log(" 🎉 ALL TESTS PASSED: MongoDB Write & Twilio Trigger Verified!");
    console.log("==================================================\n");
  } catch (error) {
    console.error("\n❌ Test failed with error:", error.message);
    if (error.cause) console.error("Cause:", error.cause);
    console.log("\nMake sure your server is running (`npm run dev`) on port " + PORT);
    process.exit(1);
  }
}

runAccidentTest();

