import app from "./app.js";

import {
  connectDatabase,
  disconnectDatabase,
} from "./config/database.js";

import { env } from "./config/env.js";

const PORT = Number(env.PORT || 4001);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}

if (!env.FRONTEND_ORIGIN) {
  throw new Error("FRONTEND_ORIGIN is required");
}

if (!env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required");
}

const SHUTDOWN_TIMEOUT_MS = 10000;

let server;
let isShuttingDown = false;

// --------------------------------------------------
// Graceful shutdown
// --------------------------------------------------

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(`${signal} received. Shutting down Auth Service...`);

  let shutdownFailed = false;
  let timeout;

  try {
    // Force-close remaining HTTP connections if graceful
    // shutdown does not finish within the allowed time.
    const shutdownTimeout = new Promise((resolve) => {
      timeout = setTimeout(() => {
        console.error("Graceful shutdown timed out.");

        shutdownFailed = true;

        if (server) {
          server.closeAllConnections?.();
        }

        resolve();
      }, SHUTDOWN_TIMEOUT_MS);

      timeout.unref();
    });

    const closeHttpServer = new Promise((resolve) => {
      if (!server || !server.listening) {
        return resolve();
      }

      server.close((error) => {
        if (error) {
          console.error("HTTP server shutdown error:", error.message);
          shutdownFailed = true;
        }

        resolve();
      });
    });

    await Promise.race([
      closeHttpServer,
      shutdownTimeout,
    ]);

    // Release database resources after HTTP shutdown.
    try {
      await disconnectDatabase();
      console.log("MongoDB disconnected");
    } catch (error) {
      console.error("MongoDB shutdown error:", error.message);
      shutdownFailed = true;
    }
  } catch (error) {
    console.error("Shutdown failed:", error.message);
    shutdownFailed = true;
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }

    process.exitCode = shutdownFailed ? 1 : 0;

    console.log("Auth Service shutdown completed");
  }
}

// --------------------------------------------------
// Start application
// --------------------------------------------------

async function startServer() {
  try {
    // 1. Establish database connection.
    await connectDatabase();

    console.log("MongoDB connected successfully");

    // 2. Start HTTP server only after database connection.
    server = app.listen(PORT, () => {
      console.log(`Auth Service running on port ${PORT}`);
      console.log(`Health endpoint: http://localhost:${PORT}/health`);
      console.log(`Readiness endpoint: http://localhost:${PORT}/ready`);
    });

    // 3. Handle HTTP server errors.
    server.on("error", (error) => {
      console.error("HTTP server error:", error.message);

      if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use`);
      }

      process.exitCode = 1;

      void shutdown("SERVER_ERROR");
    });

    // 4. Register termination signal handlers.
    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });

  } catch (error) {
    console.error("Failed to start Auth Service:", error.message);

    process.exitCode = 1;

    try {
      await disconnectDatabase();
    } catch (dbError) {
      console.error(
        "Database cleanup after startup failure:",
        dbError.message
      );
    }
  }
}

void startServer();
