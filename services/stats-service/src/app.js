import express from "express";
import cors from "cors";
import mongoose from "mongoose";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import matchImportRoutes from "./modules/imports/match-import.routes.js";
import matchStatsRoutes from "./modules/matches/match-stats.routes.js";
import playerStatsRoutes from "./modules/players/player-stats.routes.js";

const app = express();

// CORS configuration
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Request parsing
app.use(express.json({ limit: "100kb" }));

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "stats-service",
    status: "healthy",
    database: {
      readyState: mongoose.connection.readyState,
    },
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/v1/internal/stats", matchImportRoutes);
app.use("/api/v1/stats/matches", matchStatsRoutes);
app.use("/api/v1/stats/players", playerStatsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});

// Central error handler
app.use(errorHandler);


export default app;
