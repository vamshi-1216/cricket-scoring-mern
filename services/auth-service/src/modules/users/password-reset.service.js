
import { createHash, randomBytes } from "node:crypto";
import { User } from "./user.model.js";
import { sendEmail } from "../../utils/email.js";
import { hashPassword } from "../../utils/password.js";
import { env } from "../../config/env.js";

const RESET_EXPIRY_MS = 15 * 60 * 1000;

const GENERIC_MESSAGE =
  "If an eligible account exists for that email, a password-reset link will be sent.";

export class PasswordResetError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PasswordResetError";
    this.statusCode = statusCode;
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(inputEmail) {
  const email =
    typeof inputEmail === "string"
      ? inputEmail.trim().toLowerCase()
      : "";

  if (!email || email.length > 254) {
    throw new PasswordResetError("Enter a valid email address.", 400);
  }

  const user = await User.findOne({
    email,
    emailVerified: true,
    status: "active",
  }).select("+passwordHash");

  // Do not reveal whether an eligible account exists.
  if (!user || !user.passwordHash) {
    return { message: GENERIC_MESSAGE };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);

  user.passwordReset = {
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_EXPIRY_MS),
  };

  await user.save();

  const resetUrl =
    `${env.FRONTEND_ORIGIN}/reset-password` +
    `?token=${encodeURIComponent(rawToken)}`;

  try {
    await sendEmail({
      to: user.email,
      subject: "Cricket Scoring System - Password Reset",
      text:
        "We received a request to reset your password.\n\n" +
        `Open this link to choose a new password:\n${resetUrl}\n\n` +
        "This link expires in 15 minutes and can only be used once. " +
        "If you didn't request this, ignore this email.",
      html: `
        <h2>Reset your password</h2>
        <p>We received a request to reset your Cricket Scoring System password.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 20px;background:#34d399;color:#09090b;text-decoration:none;border-radius:8px;font-weight:bold">
            Reset password
          </a>
        </p>
        <p>This link expires in 15 minutes and can only be used once.</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `,
    });
  } catch {
    // Clear only this request's token. Do not erase a newer reset token.
    try {
      await User.updateOne(
        {
          _id: user._id,
          "passwordReset.tokenHash": tokenHash,
        },
        {
          $unset: {
            "passwordReset.tokenHash": 1,
            "passwordReset.expiresAt": 1,
          },
        }
      );
    } catch {
      // Preserve the original email-delivery error.
    }

    throw new PasswordResetError(
      "Unable to send the reset email. Please try again later.",
      503
    );
  }

  return { message: GENERIC_MESSAGE };
}

export async function resetPassword(inputToken, inputPassword) {
  const token =
    typeof inputToken === "string" ? inputToken.trim() : "";

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    throw new PasswordResetError(
      "This reset link is invalid or expired. Request a new one.",
      400
    );
  }

  if (typeof inputPassword !== "string") {
    throw new PasswordResetError("Enter a new password.", 400);
  }

  if (inputPassword.length < 8) {
    throw new PasswordResetError(
      "Password must contain at least 8 characters.",
      400
    );
  }

  if (Buffer.byteLength(inputPassword, "utf8") > 72) {
    throw new PasswordResetError(
      "Password must not exceed 72 bytes.",
      400
    );
  }

  const passwordHash = await hashPassword(inputPassword);

  // Atomically validate and consume the token.
  // Only one concurrent request can successfully match it.
  const user = await User.findOneAndUpdate(
    {
      "passwordReset.tokenHash": hashToken(token),
      "passwordReset.expiresAt": { $gt: new Date() },
      emailVerified: true,
      status: "active",
      passwordHash: { $exists: true, $ne: null },
    },
    {
      $set: { passwordHash },
      $unset: {
        "passwordReset.tokenHash": 1,
        "passwordReset.expiresAt": 1,
      },
      $inc: { sessionVersion: 1 },
    },
    { new: true }
  );

  if (!user) {
    throw new PasswordResetError(
      "This reset link is invalid or expired. Request a new one.",
      400
    );
  }

  return {
    message: "Password reset successfully. You can now sign in.",
  };
}
