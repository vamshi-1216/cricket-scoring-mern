import mongoose from "mongoose";
import { env } from "./env.js";

mongoose.set("strictQuery", true);

export async function connectDatabase() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("Stats Service connected to MongoDB.");
  } catch (error) {
    console.error("Stats Service MongoDB connection failed:", error.message);
    throw error;
  }
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();

  console.log("Stats Service disconnected from MongoDB.");
}