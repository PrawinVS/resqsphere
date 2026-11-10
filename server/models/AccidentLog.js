import mongoose from "mongoose";

const accidentLogSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true
    },
    vehicleNumber: {
      type: String,
      required: true,
      default: "RESQ-VEHICLE-01"
    },
    eventType: {
      type: String,
      required: true
    },
    status: {
      type: String,
      default: "CANDIDATE — verify"
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    gpsFix: {
      type: Boolean,
      default: false
    },
    tiltDeg: {
      type: Number,
      default: null
    },
    note: {
      type: String,
      default: "Tilt threshold triggered; prototype event, not a confirmed crash."
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

accidentLogSchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    if (ret.timestamp instanceof Date) {
      ret.timestamp = ret.timestamp.toISOString();
    }
    return ret;
  }
});

export const AccidentLog = mongoose.model("AccidentLog", accidentLogSchema);
export default AccidentLog;

