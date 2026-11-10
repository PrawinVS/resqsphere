import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/resqsphere";

  try {
    await mongoose.connect(uri);
    console.log(
      `[MongoDB] Connected: db="${mongoose.connection.name}" host=${mongoose.connection.host}`
    );
    return mongoose.connection;
  } catch (error) {
    console.error(`[MongoDB] Connection failed: ${error.message}`);
    process.exit(1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("[MongoDB] Disconnected from server");
});

mongoose.connection.on("reconnected", () => {
  console.log("[MongoDB] Reconnected to server");
});

export default connectDB;
