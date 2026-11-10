import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

import connectDB from "./config/db.js";
import healthRoutes from "./routes/healthRoutes.js";
import telemetryRoutes from "./routes/telemetryRoutes.js";
import accidentRoutes from "./routes/accidentRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import errorHandler from "./middleware/errorHandler.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

// Global Middlewares
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "100kb" }));

// API Routes
app.use("/api/health", healthRoutes);
app.use("/api/telemetry", telemetryRoutes);
app.use("/api/accidents", accidentRoutes);
app.use("/api/contacts", contactRoutes);

// Centralized Error Handling
app.use(errorHandler);

// Server startup function
export async function startServer(port = PORT) {
  await connectDB();
  return new Promise((resolve) => {
    const server = app.listen(port, "0.0.0.0", () => {
      console.log(`[ResQLink API] Running on http://localhost:${port}`);
      console.log(`[ResQLink API] Client Origin: ${CLIENT_ORIGIN}`);
      console.log(`[ResQLink API] Database: MongoDB`);
      resolve(server);
    });
  });
}

// Start immediately if executed directly
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  startServer();
}

export { app };
export default app;
