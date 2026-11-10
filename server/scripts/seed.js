import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Device from "../models/Device.js";
import Contact from "../models/Contact.js";
import AccidentLog from "../models/AccidentLog.js";
import Telemetry from "../models/Telemetry.js";

dotenv.config();

async function seed() {
  try {
    await connectDB();
    console.log("[Seed] Clearing existing demo data...");

    await Promise.all([
      Device.deleteMany({}),
      Contact.deleteMany({}),
      AccidentLog.deleteMany({}),
      Telemetry.deleteMany({})
    ]);

    console.log("[Seed] Inserting starter emergency contacts...");
    const contacts = await Contact.insertMany([
      {
        name: "National Emergency Service",
        relationship: "Emergency SOS",
        phone: "+91 112"
      },
      {
        name: "Dr. Ramesh Kumar",
        relationship: "Primary Contact / Family",
        phone: "+91 98765 43210"
      },
      {
        name: "Priya Sharma",
        relationship: "Spouse / Relative",
        phone: "+91 98450 12345"
      }
    ]);
    console.log(`[Seed] Added ${contacts.length} emergency contacts.`);

    console.log("[Seed] Initializing device and telemetry...");
    const initialLocation = {
      deviceId: "resqlink-esp32-01",
      vehicleNumber: "RESQ-VEHICLE-01",
      gpsFix: true,
      latitude: 12.971598,
      longitude: 77.594566,
      satellites: 9,
      speedKmph: 32.4,
      imuReady: true,
      ax: 0.12,
      ay: -0.05,
      az: 9.81,
      gx: 0.01,
      gy: 0.02,
      gz: -0.01,
      accelMagnitude: 9.81,
      tiltDeg: 14.2,
      eventType: "NORMAL",
      previousEventType: "NORMAL",
      updatedAt: new Date()
    };

    await Device.create(initialLocation);
    await Telemetry.create({
      ...initialLocation,
      timestamp: initialLocation.updatedAt
    });

    console.log("[Seed] Database successfully seeded with MongoDB records!");
  } catch (err) {
    console.error("[Seed] Error seeding database:", err);
  } finally {
    await mongoose.disconnect();
    console.log("[Seed] Disconnected from MongoDB.");
    process.exit(0);
  }
}

seed();

