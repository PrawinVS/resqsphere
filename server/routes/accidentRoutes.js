import { Router } from "express";
import {
  getAccidents,
  clearAccidents
} from "../controllers/accidentController.js";

const router = Router();

router.get("/", getAccidents);
router.delete("/", clearAccidents);

export default router;

