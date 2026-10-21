
import { randomInt, randomBytes, createHash, timingSafeEqual } from "node:crypto";

export function generateOtp() {
  return randomInt(100000, 1000000).toString();
}

export function hashOtp(otp) {
  return createHash("sha256").update(otp).digest("hex");
}

export function verifyOtp(otp, storedHash) {
  if (
    typeof otp !== "string" ||
    typeof storedHash !== "string" ||
    !/^\d{6}$/.test(otp) ||
    !/^[a-f0-9]{64}$/i.test(storedHash)
  ) {
    return false;
  }

  const submittedHash = Buffer.from(hashOtp(otp), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");

  return timingSafeEqual(submittedHash, expectedHash);
}

export function generateOtpToken() {
  return randomBytes(32).toString("hex");
}

export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
