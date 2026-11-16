import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export function requireInternalService(req, res, next) {
  const configuredSecret = env.INTERNAL_SERVICE_SECRET;
  const suppliedSecret = req.get("X-Internal-Service-Secret");

  // Verify that the server secret is configured correctly.
  if (
    typeof configuredSecret !== "string" ||
    configuredSecret.length < 32 ||
    !/\S/.test(configuredSecret)
  ) {
    return res.status(503).json({
      success: false,
      message: "Internal service authentication is not configured.",
    });
  }

  // Verify that the request contains the internal secret.
  if (typeof suppliedSecret !== "string") {
    return res.status(401).json({
      success: false,
      message: "Internal service authentication required.",
    });
  }

  // Hash both values to produce equal-length buffers.
  const expected = createHash("sha256")
    .update(configuredSecret, "utf8")
    .digest();

  const supplied = createHash("sha256")
    .update(suppliedSecret, "utf8")
    .digest();

  // Compare secrets using a timing-safe comparison.
  if (!timingSafeEqual(expected, supplied)) {
    return res.status(401).json({
      success: false,
      message: "Internal service authentication failed.",
    });
  }

  return next();
}