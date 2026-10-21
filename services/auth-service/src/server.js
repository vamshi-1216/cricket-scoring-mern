import app from "./app.js";
import {
  connectDatabase,
  disconnectDatabase
} from "./config/database.js";
import { env } from "./config/env.js";

const PORT = Number(env.PORT || 4001);
const FRONTEND_ORIGIN = env.FRONTEND_ORIGIN;
const MONGODB_URI = env.MONGODB_URI;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}

if (!FRONTEND_ORIGIN) {
  throw new Error("FRONTEND_ORIGIN is required");
}

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required");
}



async function startServer() {
  await connectDatabase();

  const server = app.listen(PORT, () => {
    console.log(`Auth Service running on port ${PORT}`);
    console.log(`Health endpoint: http://localhost:${PORT}/health`);
  });

  async function shutdown(signal) {
    console.log(`${signal} received. Shutting down Auth Service...`);

    server.close(async (error) => {
      try {
        await disconnectDatabase();
      } catch (dbError) {
        console.error("MongoDB shutdown error:", dbError.message);
        process.exitCode = 1;
      }

      if (error) {
        console.error("HTTP server shutdown error:", error.message);
        process.exitCode = 1;
      }
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

startServer().catch((error) => {
  console.error("Failed to start Auth Service:", error.message);
  process.exitCode = 1;
});
