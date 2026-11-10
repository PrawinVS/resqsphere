import { Router } from "express";
import {
  receiveTelemetry,
  getLatestTelemetry,
  getTelemetryHistory
} from "../controllers/telemetryController.js";

const router = Router();

router.post("/location", receiveTelemetry);
router.get("/latest", getLatestTelemetry);
router.get("/history", getTelemetryHistory);

export default router;

