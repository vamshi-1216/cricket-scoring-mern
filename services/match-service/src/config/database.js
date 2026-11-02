import mongoose from "mongoose";
import { env } from "./env.js";
import { ScoringPermit } from "../modules/matches/scoring-permit.model.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);

  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  await ScoringPermit.createIndexes();

  console.log("Match Service connected to MongoDB");
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}