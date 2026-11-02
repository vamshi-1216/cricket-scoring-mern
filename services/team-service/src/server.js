import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";

let server;
let shuttingDown = false;

async function startServer() {
  await connectDatabase();

  server = app.listen(env.PORT, () => {
    console.log(`Team Service running on port ${env.PORT}`);
  });
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received. Shutting down Team Service...`);

  const timeout = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10000);

  timeout.unref();

  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }

    await disconnectDatabase();
    console.log("Team Service shut down successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Shutdown failed:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

startServer().catch(async (error) => {
  console.error("Failed to start Team Service:", error);

  try {
    await disconnectDatabase();
  } catch (disconnectError) {
    console.error("MongoDB disconnect failed:", disconnectError);
  }

  process.exit(1);
});