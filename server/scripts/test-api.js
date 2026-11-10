process.env.NODE_ENV = "test";

import dotenv from "dotenv";
import mongoose from "mongoose";
import { startServer } from "../server.js";

dotenv.config();

const PORT = 5099;
let server;

async function runTests() {
  server = await startServer(PORT);
  const baseUrl = `http://127.0.0.1:${PORT}`;
  console.log(`[Test] Test server listening on ${baseUrl}`);

  try {
    // 1. Health check
    console.log("[Test] 1. Testing GET /api/health...");
    const healthRes = await fetch(`${baseUrl}/api/health`);
    const healthData = await healthRes.json();
    console.log("   Health status:", healthData);
    if (healthData.storage !== "MongoDB" || healthData.database?.status !== "connected") {
      throw new Error("Health check failed");
    }

    // 2. Contacts GET
    console.log("[Test] 2. Testing GET /api/contacts...");
    const contactsRes = await fetch(`${baseUrl}/api/contacts`);
    const contactsData = await contactsRes.json();
    console.log(`   Contacts count: ${contactsData.contacts.length}`);
    if (!Array.isArray(contactsData.contacts)) {
      throw new Error("Invalid contacts response format");
    }

    // 3. Contact POST
    console.log("[Test] 3. Testing POST /api/contacts...");
    const createRes = await fetch(`${baseUrl}/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Officer",
        relationship: "Highway Patrol",
        phone: "+91 99999 88888"
      })
    });
    const createData = await createRes.json();
    console.log("   Created contact:", createData.contact);
    if (!createData.success || !createData.contact?.id) {
      throw new Error("Contact creation failed");
    }

    // 4. Contact DELETE
    console.log("[Test] 4. Testing DELETE /api/contacts/:id...");
    const deleteRes = await fetch(`${baseUrl}/api/contacts/${createData.contact.id}`, {
      method: "DELETE"
    });
    const deleteData = await deleteRes.json();
    console.log("   Delete result:", deleteData);
    if (!deleteData.success) {
      throw new Error("Contact deletion failed");
    }

    // 5. Telemetry POST (Normal)
    console.log("[Test] 5. Testing POST /api/telemetry/location (NORMAL)...");
    const telemRes = await fetch(`${baseUrl}/api/telemetry/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "test-device-01",
        vehicleNumber: "TEST-CAR-99",
        gpsFix: true,
        latitude: 13.0827,
        longitude: 80.2707,
        satellites: 10,
        speedKmph: 45.2,
        imuReady: true,
        ax: 0.05,
        ay: 0.1,
        az: 9.8,
        tiltDeg: 8.5,
        eventType: "NORMAL"
      })
    });
    const telemData = await telemRes.json();
    console.log("   Telemetry response success:", telemData.success);
    if (!telemData.success || telemData.location.vehicleNumber !== "TEST-CAR-99") {
      throw new Error("Telemetry post failed");
    }

    // 6. Telemetry GET latest
    console.log("[Test] 6. Testing GET /api/telemetry/latest...");
    const latestRes = await fetch(`${baseUrl}/api/telemetry/latest`);
    const latestData = await latestRes.json();
    console.log("   Latest location deviceId:", latestData.location?.deviceId);
    if (latestData.location?.deviceId !== "test-device-01") {
      throw new Error("Latest telemetry mismatch");
    }

    // 7. Telemetry POST (Rollover Candidate)
    console.log("[Test] 7. Testing POST /api/telemetry/location (ROLLOVER_CANDIDATE)...");
    const rolloverRes = await fetch(`${baseUrl}/api/telemetry/location`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "test-device-01",
        vehicleNumber: "TEST-CAR-99",
        gpsFix: true,
        latitude: 13.0827,
        longitude: 80.2707,
        satellites: 10,
        speedKmph: 12.0,
        imuReady: true,
        ax: 5.2,
        ay: 8.4,
        az: 2.1,
        tiltDeg: 68.5,
        eventType: "ROLLOVER_CANDIDATE"
      })
    });
    const rolloverData = await rolloverRes.json();
    console.log("   Rollover candidate submitted:", rolloverData.success);

    // 8. Accidents GET
    console.log("[Test] 8. Testing GET /api/accidents...");
    const accidentsRes = await fetch(`${baseUrl}/api/accidents`);
    const accidentsData = await accidentsRes.json();
    console.log(`   Accidents count: ${accidentsData.accidents.length}`);
    const recorded = accidentsData.accidents.find((a) => a.deviceId === "test-device-01");
    if (!recorded || recorded.eventType !== "ROLLOVER_CANDIDATE") {
      throw new Error("Accident candidate event was not recorded in MongoDB");
    }
    console.log("   Recorded accident verified in MongoDB:", recorded);

    console.log("\n=========================================");
    console.log(" ALL TESTS PASSED SUCCESSFULLY! (MongoDB)");
    console.log("=========================================\n");
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("[Test] Test failed:", err);
  if (server) server.close();
  process.exit(1);
});
