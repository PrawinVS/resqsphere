import mongoose from "mongoose";

export function getHealth(req, res) {
  const isDbConnected = mongoose.connection.readyState === 1;

  res.json({
    status: isDbConnected ? "ok" : "degraded",
    service: "ResQLink API",
    storage: "MongoDB",
    database: {
      status: isDbConnected ? "connected" : "disconnected",
      host: mongoose.connection.host || null,
      name: mongoose.connection.name || null
    }
  });
}

