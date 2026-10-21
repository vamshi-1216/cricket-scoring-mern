
import bcrypt from "bcrypt";
import { User } from "./user.model.js";

export class LoginError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "LoginError";
    this.statusCode = statusCode;
  }
}

export async function authenticateWithPassword({ identifier, password }) {
  if (
    typeof identifier !== "string" ||
    !identifier.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    throw new LoginError("Enter your email/phone number and password.", 400);
  }

  const normalizedIdentifier = identifier.trim();
  const isEmail = normalizedIdentifier.includes("@");
  const isPhone = /^\+[1-9]\d{7,14}$/.test(normalizedIdentifier);

  if (!isEmail && !isPhone) {
    throw new LoginError(
      "Enter a valid email address or phone number with country code.",
      400
    );
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new LoginError("Invalid email/phone number or password.", 401);
  }

  const query = isEmail
    ? { email: normalizedIdentifier.toLowerCase() }
    : { phone: normalizedIdentifier };

  const user = await User.findOne(query).select("+passwordHash");

  // Use the same response for missing users and incorrect passwords.
  if (!user || !user.passwordHash) {
    throw new LoginError("Invalid email/phone number or password.", 401);
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new LoginError("Invalid email/phone number or password.", 401);
  }

  if (user.status === "suspended") {
    throw new LoginError("This account is suspended.", 403);
  }

  if (user.status !== "active") {
    throw new LoginError(
      "Please verify your email address or phone number before signing in.",
      403
    );
  }

  // Prevent signing in with an unverified identifier.
  if (isEmail && !user.emailVerified) {
    throw new LoginError("Please verify your email address before signing in.", 403);
  }

  if (isPhone && !user.phoneVerified) {
    throw new LoginError("Please verify your phone number before signing in.", 403);
  }

  user.lastLoginAt = new Date();
  await user.save();

  // Return safe user fields only; never return passwordHash.
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    status: user.status,
    role: user.role,
    sessionVersion: user.sessionVersion ?? 0
  };
}
