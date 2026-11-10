import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Contact name is required"],
      trim: true,
      minlength: [2, "Contact name must be between 2 and 80 characters."],
      maxlength: [80, "Contact name must be between 2 and 80 characters."]
    },
    relationship: {
      type: String,
      trim: true,
      default: "Emergency contact"
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      validate: {
        validator: function (v) {
          return /^[+0-9() -]{7,20}$/.test(v);
        },
        message: "Enter a valid phone number."
      }
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

contactSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    if (ret.createdAt instanceof Date) {
      ret.createdAt = ret.createdAt.toISOString();
    }
    return ret;
  }
});

export const Contact = mongoose.model("Contact", contactSchema);
export default Contact;

