import { Router } from "express";
import {
  getContacts,
  createContact,
  deleteContact
} from "../controllers/contactController.js";

const router = Router();

router.get("/", getContacts);
router.post("/", createContact);
router.delete("/:id", deleteContact);

export default router;

