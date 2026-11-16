
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id ? user._id.toString() : user.id,
      role: user.role,
      sv: user.sessionVersion ?? 0,
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: "cricket-scoring-auth",
      audience: "cricket-scoring-web",
      algorithm: "HS256",
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: "cricket-scoring-auth",
    audience: "cricket-scoring-web",
    algorithms: ["HS256"],
  });
}

export function getAccessTokenMaxAge(token) {
  const payload = jwt.decode(token);
  if (!Number.isInteger(payload?.exp)) {
    throw new Error("Access token expiration is unavailable.");
  }
  return Math.max(0, payload.exp * 1000 - Date.now());
}
