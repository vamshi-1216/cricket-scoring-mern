import express from "express";
import cors from "cors";
import mongoose from "mongoose";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";

const app = express();

// CORS configuration
app.use(
  cors({
    origin: env.FRONTEND_ORIGIN || "http://localhost:5173",
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