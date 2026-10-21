
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
