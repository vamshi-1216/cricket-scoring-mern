
import { createHash, randomBytes } from "node:crypto";
import { env } from "../../config/env.js";
import { User } from "./user.model.js";
import { hashPassword } from "../../utils/password.js";

const PHONE_RESET_EXPIRY_MS = 10 * 60 * 1000;

export class PhonePasswordResetError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PhonePasswordResetError";
    this.statusCode = statusCode;
  }
}

function normalizePhone(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validatePhone(phone) {
  if (
    typeof phone !== "string" ||
    !/^\+[1-9]\d{7,14}$/.test(phone.trim())
  ) {
    throw new PhonePasswordResetError(
      "Enter a valid phone number with its country code."
    );
  }

  return phone.trim();
}

async function verifyMsg91AccessToken(phone, accessToken) {
  if (
    typeof accessToken !== "string" ||
    accessToken.trim().length < 8
  ) {
    throw new PhonePasswordResetError(
      "MSG91 verification token is missing or invalid."
    );
  }

  if (!env.MSG91_AUTH_KEY) {
    throw new PhonePasswordResetError(
      "Phone recovery is not configured on the server.",
      500
    );
  }

  let response;

  try {
    response = await fetch(
      "https://control.msg91.com/api/v5/widget/verifyAccessToken",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authkey: env.MSG91_AUTH_KEY,
          "access-token": accessToken.trim(),
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
  } catch {
    throw new PhonePasswordResetError(
      "Could not reach MSG91. Please try again.",
      502
    );
  }

  const result = await response.json().catch(() => null);

  if (
    !response.ok ||
    !result ||
    String(result.type ?? "").toLowerCase() !== "success"
  ) {
    throw new PhonePasswordResetError(
      "Phone verification failed. Complete OTP verification again.",
      401
    );
  }

  const verifiedIdentifier =
    result.identifier ??
    result.mobile ??
    result.data?.identifier ??
    result.data?.mobile ??
    result.message;

  if (
    typeof verifiedIdentifier !== "string" ||
    normalizePhone(verifiedIdentifier) !== normalizePhone(phone)
  ) {
    throw new PhonePasswordResetError(
      "The verified phone number does not match.",
      403
    );
  }
}

/**
 * Verify phone ownership through MSG91 and issue a one-time
 * password-recovery token. This does not change account status
 * or registration verification flags.
 */
export async function verifyPhoneForPasswordReset({
  phone,
  accessToken,
}) {
  const normalizedPhone = validatePhone(phone);

  await verifyMsg91AccessToken(normalizedPhone, accessToken);

  const user = await User.findOne({
    phone: normalizedPhone,
    phoneVerified: true,
    status: "active",
    passwordHash: { $exists: true, $ne: null },
  });

  if (!user) {
    throw new PhonePasswordResetError(
      "Phone recovery is unavailable for this account.",
      400
    );
  }

  const recoveryToken = randomBytes(32).toString("hex");

  user.phonePasswordReset = {
    tokenHash: hashToken(recoveryToken),
    expiresAt: new Date(Date.now() + PHONE_RESET_EXPIRY_MS),
  };

  await user.save();

  return {
    recoveryToken,
    expiresInSeconds: PHONE_RESET_EXPIRY_MS / 1000,
  };
}

/**
 * Atomically consume a valid recovery token and update the password.
 * A successful reset also increments sessionVersion.
 */
export async function resetPasswordWithPhone({
  recoveryToken,
  password,
}) {
  if (
    typeof recoveryToken !== "string" ||
    !/^[a-f0-9]{64}$/i.test(recoveryToken)
  ) {
    throw new PhonePasswordResetError(
      "The recovery session is invalid or expired. Verify your phone again.",
      400
    );
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new PhonePasswordResetError(
      "Password must contain at least 8 characters and must not exceed 72 UTF-8 bytes."
    );
  }

  const passwordHash = await hashPassword(password);

  // Validate and consume the token in one atomic operation.
  const user = await User.findOneAndUpdate(
    {
      "phonePasswordReset.tokenHash": hashToken(recoveryToken),
      "phonePasswordReset.expiresAt": { $gt: new Date() },
      phoneVerified: true,
      status: "active",
      passwordHash: { $exists: true, $ne: null },
    },
    {
      $set: { passwordHash },
      $unset: {
        "phonePasswordReset.tokenHash": 1,
        "phonePasswordReset.expiresAt": 1,
      },
      $inc: { sessionVersion: 1 },
    },
    { new: true }
  );

  if (!user) {
    throw new PhonePasswordResetError(
      "The recovery session is invalid or expired. Verify your phone again.",
      400
    );
  }

  return { message: "Password reset successfully." };
}
