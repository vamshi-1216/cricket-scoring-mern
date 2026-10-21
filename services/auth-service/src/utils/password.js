import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;

export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must contain at least 8 characters");
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Password must not exceed 72 bytes");
  }

  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  if (typeof password !== "string" || typeof passwordHash !== "string") {
    return false;
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    return false;
  }

  return bcrypt.compare(password, passwordHash);
}