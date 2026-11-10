import mongoose from "mongoose";

const telemetrySchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true
    },
    vehicleNumber: {
      type: String,
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
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

telemetrySchema.index({ deviceId: 1, timestamp: -1 });

telemetrySchema.set("toJSON", {
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    if (ret.timestamp instanceof Date) {
      ret.timestamp = ret.timestamp.toISOString();
    }
    return ret;
  }
});

export const Telemetry = mongoose.model("Telemetry", telemetrySchema);
export default Telemetry;

