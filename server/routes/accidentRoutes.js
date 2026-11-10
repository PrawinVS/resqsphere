import { Router } from "express";
import {
  getAccidents,
  clearAccidents,
  reportAccidentWithVoiceCall
} from "../controllers/accidentController.js";

const router = Router();

router.get("/", getAccidents);
router.delete("/", clearAccidents);
router.post("/report", reportAccidentWithVoiceCall);
router.post("/trigger-call", reportAccidentWithVoiceCall);

export default router;

