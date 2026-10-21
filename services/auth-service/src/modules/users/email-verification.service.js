
import { User } from "./user.model.js";
import { sendEmail } from "../../utils/email.js";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  OTP_EXPIRY_MS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_MAX_ATTEMPTS
} from "../../utils/otp.js";

export class EmailVerificationError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = "EmailVerificationError";
    this.statusCode = statusCode;
  }
}

export async function sendEmailOtp(inputEmail) {
  const email =
    typeof inputEmail === "string"
      ? inputEmail.trim().toLowerCase()
      : "";

  if (!email) {
    throw new EmailVerificationError("Email is required", 400);
  }

  const user = await User.findOne({ email }).select(
    "+emailVerification.otpHash"
  );

  // Avoid revealing whether an email address has an account.
  if (!user || user.emailVerified) {
    return {
      message: "If the account exists and needs verification, an email will be sent."
    };
  }

  const now = Date.now();
  const lastSentAt = user.emailVerification?.lastSentAt;

  if (
    lastSentAt &&
    now - new Date(lastSentAt).getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    throw new EmailVerificationError(
      "Please wait before requesting another OTP",
      429
    );
  }

  const otp = generateOtp();

  user.emailVerification = {
    ...user.emailVerification?.toObject?.(),
    otpHash: hashOtp(otp),
    expiresAt: new Date(now + OTP_EXPIRY_MS),
    attempts: 0,
    lastSentAt: new Date(now)
  };

  await user.save();

  try {
    await sendEmail({
      to: email,
      subject: "Cricket Scoring System - Email Verification",
      text: `Your email verification OTP is ${otp}. It expires in 5 minutes. Do not share this code with anyone.`,
      html: `
        <h2>Verify your email</h2>
        <p>Your Cricket Scoring System verification code is:</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:6px">${otp}</p>
        <p>This code expires in 5 minutes. Do not share it with anyone.</p>
      `
    });
  } catch (error) {
    user.emailVerification.otpHash = undefined;
    user.emailVerification.expiresAt = undefined;
    user.emailVerification.attempts = 0;
    await user.save();

    throw new EmailVerificationError(
      "Unable to send verification email. Please try again later.",
      503
    );
  }

  return {
    message: "If the account exists and needs verification, an email will be sent."
  };
}

export async function verifyEmailOtp(inputEmail, inputOtp) {
  const email =
    typeof inputEmail === "string"
      ? inputEmail.trim().toLowerCase()
      : "";

  const otp = typeof inputOtp === "string" ? inputOtp.trim() : "";

  if (!email || !/^\d{6}$/.test(otp)) {
    throw new EmailVerificationError(
      "A valid email and six-digit OTP are required",
      400
    );
  }

  const user = await User.findOne({ email }).select(
    "+emailVerification.otpHash"
  );

  if (!user || user.emailVerified) {
    throw new EmailVerificationError(
      "Invalid or expired verification code",
      400
    );
  }

  const verification = user.emailVerification;

  if (!verification?.otpHash || !verification.expiresAt) {
    throw new EmailVerificationError(
      "Invalid or expired verification code",
      400
    );
  }

  if (verification.expiresAt.getTime() <= Date.now()) {
    verification.otpHash = undefined;
    verification.expiresAt = undefined;
    verification.attempts = 0;
    await user.save();

    throw new EmailVerificationError(
      "Invalid or expired verification code",
      400
    );
  }

  if (verification.attempts >= OTP_MAX_ATTEMPTS) {
    throw new EmailVerificationError(
      "Too many incorrect attempts. Request a new OTP.",
      429
    );
  }

  if (!verifyOtp(otp, verification.otpHash)) {
    verification.attempts += 1;

    if (verification.attempts >= OTP_MAX_ATTEMPTS) {
      verification.otpHash = undefined;
      verification.expiresAt = undefined;
    }

    await user.save();

    throw new EmailVerificationError(
      verification.attempts >= OTP_MAX_ATTEMPTS
        ? "Too many incorrect attempts. Request a new OTP."
        : "Invalid or expired verification code",
      verification.attempts >= OTP_MAX_ATTEMPTS ? 429 : 400
    );
  }

  user.emailVerified = true;
  user.emailVerification.otpHash = undefined;
  user.emailVerification.expiresAt = undefined;
  user.emailVerification.attempts = 0;

  if (!user.phone || user.phoneVerified) {
    user.status = "active";
  }

  await user.save();

  return {
    message: "Email verified successfully",
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      status: user.status
    }
  };
}
