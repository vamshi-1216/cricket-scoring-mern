
import mongoose from "mongoose";
import { env } from "./env.js";

// --------------------------------------------------
// MongoDB connection state
// --------------------------------------------------

let connectionPromise = null;

// --------------------------------------------------
// Connection event listeners
// Registered once when this module is loaded.
// --------------------------------------------------

mongoose.connection.on("error", (error) => {
  console.error(
    "MongoDB connection error:",
    error.message
  );
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected unexpectedly.");
});

mongoose.connection.on("reconnected", () => {
  console.log("MongoDB connection restored.");
});

// --------------------------------------------------
// Connect to MongoDB
// --------------------------------------------------

export async function connectDatabase() {
  // Already connected
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  // Reuse an ongoing connection attempt
  // instead of creating multiple connection attempts.
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose
    .connect(env.MONGODB_URI, {
      // Fail startup if MongoDB cannot be selected
      // within the configured time.
      serverSelectionTimeoutMS: 5000,

      // Maximum time to establish an individual
      // TCP connection.
      connectTimeoutMS: 10000,

      // Connection pool configuration.
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30000,

      // Avoid automatically creating indexes
      // during production application startup.
      autoIndex: env.NODE_ENV !== "production",
    })
    .then(() => {
      console.log("MongoDB connected successfully.");

      return mongoose.connection;
    })
    .finally(() => {
      // Allow a future connection attempt if needed.
      connectionPromise = null;
    });

  return connectionPromise;
}

// --------------------------------------------------
// Disconnect from MongoDB
// --------------------------------------------------

export async function disconnectDatabase() {
  // Wait for an ongoing connection attempt to finish.
  if (connectionPromise) {
    try {
      await connectionPromise;
    } catch {
      // Connection failed; nothing needs disconnecting.
    }
  }

  // readyState:
  // 0 = disconnected
  // 1 = connected
  // 2 = connecting
  // 3 = disconnecting

  if (mongoose.connection.readyState === 0) {
    return;
  }

  if (mongoose.connection.readyState === 3) {
    return;
  }

  await mongoose.disconnect();

  console.log("MongoDB disconnected successfully.");
}
