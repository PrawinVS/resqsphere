import mongoose from "mongoose";

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      default: "resqlink-esp32-01"
    },
    vehicleNumber: {
      type: String,
      required: true,
      trim: true,
      default: "RESQ-VEHICLE-01"
    },
    gpsFix: {
      type: Boolean,
      default: false
    },
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    satellites: {
      type: Number,
      default: 0
    },
    speedKmph: {
      type: Number,
      default: 0
    },
    imuReady: {
      type: Boolean,
      default: false
    },
    ax: {
      type: Number,
      default: null
    },
    ay: {
      type: Number,
      default: null
    },
    az: {
      type: Number,
      default: null
    },
    gx: {
      type: Number,
      default: null
    },
    gy: {
      type: Number,
      default: null
    },
    gz: {
      type: Number,
      default: null
    },
    accelMagnitude: {
      type: Number,
      default: null
    },
    tiltDeg: {
      type: Number,
      default: null
    },
    eventType: {
      type: String,
      enum: ["CALIBRATING", "NORMAL", "ROLLOVER_CANDIDATE"],
      default: "NORMAL"
    },
    previousEventType: {
      type: String,
      default: "NORMAL"
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

deviceSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret._id;
    if (ret.updatedAt instanceof Date) {
      ret.updatedAt = ret.updatedAt.toISOString();
    }
    return ret;
  }
});

export const Device = mongoose.model("Device", deviceSchema);
export default Device;

