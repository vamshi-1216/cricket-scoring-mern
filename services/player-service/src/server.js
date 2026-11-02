import http from "node:http";

import app from "./app.js";
import { env } from "./config/env.js";
import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";

const server = http.createServer(app);

let shuttingDown = false;

async function startServer() {
  try {
    await connectDatabase();

    server.listen(env.PORT, () => {
      console.log(`Player Service running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Player Service:", error);

    try {
      await disconnectDatabase();
    } catch (disconnectError) {
      console.error(
        "Failed to disconnect MongoDB:",
        disconnectError
      );
    }

    process.exitCode = 1;
  }
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`${signal} received. Shutting down Player Service...`);

  const forceShutdown = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10000);

  forceShutdown.unref();

  try {
    if (server.listening) {
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

    console.log("Player Service shut down successfully.");
    process.exitCode = 0;
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exitCode = 1;
  } finally {
    clearTimeout(forceShutdown);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

void startServer();