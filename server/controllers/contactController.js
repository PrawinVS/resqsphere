import mongoose from "mongoose";
import Contact from "../models/Contact.js";

export async function getContacts(req, res, next) {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    return res.json({ contacts });
  } catch (error) {
    next(error);
  }
}

export async function createContact(req, res, next) {
  try {
    const name = String(req.body?.name ?? "").trim();
    const relationship = String(req.body?.relationship ?? "").trim();
    const phone = String(req.body?.phone ?? "").trim();

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        message: "Enter a contact name between 2 and 80 characters."
      });
    }

    if (!/^[+0-9() -]{7,20}$/.test(phone)) {
      return res.status(400).json({
        message: "Enter a valid phone number."
      });
    }

    const contact = await Contact.create({
      name,
      relationship: relationship || "Emergency contact",
      phone
    });

    return res.status(201).json({
      success: true,
      contact: contact.toJSON()
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteContact(req, res, next) {
  try {
    const { id } = req.params;

    let deleted = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      deleted = await Contact.findByIdAndDelete(id);
    }

    if (!deleted) {
      return res.status(404).json({
        message: "Contact not found."
      });
    }

    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

