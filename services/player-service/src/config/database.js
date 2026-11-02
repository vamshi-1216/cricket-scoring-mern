
import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log("Player Service connected to MongoDB");
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  console.log("Player Service disconnected from MongoDB");
}
