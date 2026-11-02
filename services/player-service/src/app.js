import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import playerRoutes from "./modules/players/player.routes.js";

const app = express();

// CORS configuration
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    credentials: true,
  })
);

// Request parsing
app.use(express.json({ limit: "10kb" }));

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "player-service",
    status: "UP",
    database: "connected",
    timestamp: new Date().toISOString(),
  });
});

// Player API routes
app.use("/api/v1/players", playerRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;

  if (statusCode >= 500) {
    console.error("Player Service error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message:
      statusCode >= 500
        ? "Internal server error."
        : err.message || "Request failed.",
    ...(err.details ? { details: err.details } : {}),
  });
});

export default app;