import mongoose from "mongoose";
import { env } from "./env.js";
import { ScoringOperation } from "../modules/scoring-operations/scoring-operation.model.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  await ScoringOperation.createIndexes();

  console.log("Scoring Service connected to MongoDB");
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
