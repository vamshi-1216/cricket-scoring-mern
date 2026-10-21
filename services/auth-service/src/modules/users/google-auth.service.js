
import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";
import { User } from "./user.model.js";

const googleClient = new OAuth2Client();

export class GoogleAuthError extends Error {
  constructor(message, statusCode = 401) {
    super(message);
    this.name = "GoogleAuthError";
    this.statusCode = statusCode;
  }
}

export async function authenticateWithGoogle(idToken) {
  if (typeof idToken !== "string" || !idToken.trim()) {
    throw new GoogleAuthError("Google ID token is required.", 400);
  }

  let payload;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID
    });

    payload = ticket.getPayload();
  } catch {
    throw new GoogleAuthError("Invalid or expired Google ID token.");
  }

  if (
    !payload ||
    !payload.sub ||
    !payload.email ||
    payload.email_verified !== true
  ) {
    throw new GoogleAuthError(
      "Google account must have a verified email address."
    );
  }

  const googleId = payload.sub;
  const email = payload.email.toLowerCase();
  const name = payload.name?.trim() || email.split("@")[0];

  // First, look for an account already linked to this Google identity.
  let user = await User.findOne({
    authProviders: {
      $elemMatch: {
        provider: "google",
        providerId: googleId
      }
    }
  });

  if (user) {
    
if (user.status !== "active") {
  throw new GoogleAuthError(
    "Your account is not active. Please contact support.",
    403
  );
}


    user.lastLoginAt = new Date();
    await user.save();
    return toSafeUser(user);
  }

  // Do not automatically link Google to an existing local account.
  const existingEmailUser = await User.findOne({ email });

  if (existingEmailUser) {
    throw new GoogleAuthError(
      "An account with this email already exists. Sign in using your existing method before linking Google.",
      409
    );
  }

  try {
    user = await User.create({
      name,
      email,
      authProviders: [
        {
          provider: "google",
          providerId: googleId
        }
      ],
      emailVerified: true,
      status: "active",
      lastLoginAt: new Date()
    });
  } catch (error) {
    if (error.code === 11000) {
      throw new GoogleAuthError(
        "An account with this email already exists. Please try signing in again.",
        409
      );
    }

    throw error;
  }

  return toSafeUser(user);
}

function toSafeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    status: user.status,
    role: user.role,
    sessionVersion: user.sessionVersion ?? 0,
  };
}