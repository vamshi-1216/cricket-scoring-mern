import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export function requireInternalService(req, res, next) {
  const configuredSecret = env.INTERNAL_SERVICE_SECRET;
  const suppliedSecret = req.get("X-Internal-Service-Secret");

  if (
    typeof configuredSecret !== "string" ||
    configuredSecret.length < 32
  ) {
    return res.status(503).json({
      success: false,
      message: "Internal service authentication is not configured.",
    });
  }

  if (typeof suppliedSecret !== "string") {
    return res.status(401).json({
      success: false,
      message: "Internal service authentication required.",
    });
  }

  const expected = createHash("sha256").update(configuredSecret, "utf8").digest();
  const supplied = createHash("sha256").update(suppliedSecret, "utf8").digest();
  if (!timingSafeEqual(expected, supplied)) {
    return res.status(401).json({
      success: false,
      message: "Internal service authentication failed.",
    });
  }

  return next();
}
