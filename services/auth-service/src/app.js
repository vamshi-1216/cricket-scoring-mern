
import express from "express";
import helmet from "helmet";
import cors from "cors";
import mongoose from "mongoose";
import { rateLimit } from "express-rate-limit";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import userRoutes from "./modules/users/user.routes.js";

const app = express();

app.disable("x-powered-by");

// Security headers
app.use(helmet());

// Cross-origin requests
app.use(
  cors({
    origin: [env.FRONTEND_ORIGIN],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
    ],
  })
);

// Request body parsing
app.use(express.json({ limit: "20kb" }));

app.use(
  express.urlencoded({
    extended: false,
    limit: "20kb",
  })
);

// HTTP-only session cookie parsing
app.use(cookieParser());

// General API rate limit: 100 requests per 15 minutes
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests. Please try again later.",
    },
  })
);

// Login rate limit: 10 failed attempts per 15-minute window.
// Successful requests do not count toward this limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

// OTP rate limit: 10 requests per 15 minutes
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP requests. Please try again later.",
  },
});

// Password recovery rate limit: 5 requests per 15 minutes
const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many password-recovery requests. Please try again later.",
  },
});

// Apply endpoint-specific limits before authentication routes.
app.use("/api/v1/auth", (req, res, next) => {
  const path = req.path;

  if (req.method === "POST" && path === "/login") {
    return loginLimiter(req, res, next);
  }

  if (
    req.method === "POST" &&
    [
      "/send-email-otp",
      "/verify-email-otp",
      "/verify-phone-otp",
    ].includes(path)
  ) {
    return otpLimiter(req, res, next);
  }

  if (
    req.method === "POST" &&
    [
      "/forgot-password",
      "/reset-password",
      "/forgot-password/verify-phone",
      "/reset-password/phone",
    ].includes(path)
  ) {
    return recoveryLimiter(req, res, next);
  }

  return next();
});

// Authentication routes
app.use("/api/v1/auth", userRoutes);

// Liveness check: confirms that the process is responding.
app.get("/health", (req, res) => {
  return res.status(200).json({
    success: true,
    service: "auth-service",
    status: "UP",
    timestamp: new Date().toISOString(),
  });
});

// Readiness check: confirms that MongoDB is connected.
app.get("/ready", (req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;

  return res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    service: "auth-service",
    status: databaseReady ? "READY" : "NOT_READY",
    database: databaseReady ? "CONNECTED" : "DISCONNECTED",
    timestamp: new Date().toISOString(),
  });
});

// Authentication API information
app.get("/api/v1/auth", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Authentication API is running",
    version: "v1",
  });
});

// Not-found handler
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Central error handler
app.use((err, req, res, next) => {
  console.error("Request failed:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(err.status || 500).json({
    success: false,
    message:
      err.status && err.status < 500
        ? err.message
        : "Internal server error",
  });
});

export default app;
