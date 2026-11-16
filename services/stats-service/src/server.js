import app from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";

let server;
let isShuttingDown = false;

async function startServer() {
  try {
    // Connect to MongoDB before accepting requests.
    await connectDatabase();

    server = app.listen(env.PORT, () => {
      console.log(`Stats Service running on port ${env.PORT}`);
      console.log(`Environment: ${env.NODE_ENV}`);
    });
  } catch (error) {
    console.error("Stats Service startup failed:", error.message);

    await disconnectDatabase().catch((disconnectError) => {
      console.error(
        "Database cleanup failed:",
        disconnectError.message
      );
    });

    process.exit(1);
  }
}

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`${signal} received. Shutting down Stats Service...`);

  const forceShutdownTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcing exit.");
    process.exit(1);
  }, 10000);

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    await disconnectDatabase();

    clearTimeout(forceShutdownTimer);

    console.log("Stats Service shut down successfully.");
    process.exit(0);
  } catch (error) {
    clearTimeout(forceShutdownTimer);

    console.error("Stats Service shutdown failed:", error.message);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();