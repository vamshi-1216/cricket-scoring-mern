import { env } from "../../config/env.js";
import { User } from "./user.model.js";

export class PhoneVerificationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "PhoneVerificationError";
    this.statusCode = statusCode;
  }
}

function normalizePhone(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

/**
 * Verify the access token returned by MSG91's OTP widget, then update the
 * matching local user. The account Auth Key stays on the server only.
 */
export async function verifyMsg91PhoneToken({ phone, accessToken }) {
  if (typeof phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
    throw new PhoneVerificationError("Enter a valid phone number in international format.", 400);
  }
  if (typeof accessToken !== "string" || accessToken.trim().length < 8) {
    throw new PhoneVerificationError("MSG91 access token is missing or invalid.", 400);
  }
  if (!env.MSG91_AUTH_KEY) {
    throw new PhoneVerificationError("Phone verification is not configured on the server.", 500);
  }

  let response;
  try {
    response = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authkey: env.MSG91_AUTH_KEY,
        "access-token": accessToken.trim(),
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new PhoneVerificationError("Could not reach MSG91 to verify the access token.", 502);
  }

  const result = await response.json().catch(() => null);
  if (!response.ok || !result || String(result.type ?? "").toLowerCase() !== "success") {
    // Never log or return the access token or account Auth Key.
    throw new PhoneVerificationError("MSG91 rejected the access token. Complete OTP verification again.", 401);
  }

  // MSG91's widget token-verification response can return the verified mobile
  // number in `message`; accept documented nested shapes defensively too.
  const verifiedIdentifier =
    result.identifier ??
    result.mobile ??
    result.data?.identifier ??
    result.data?.mobile ??
    result.message;

  if (typeof verifiedIdentifier !== "string" ||
      normalizePhone(verifiedIdentifier) !== normalizePhone(phone)) {
    throw new PhoneVerificationError("The MSG91-verified phone number does not match the registered number.", 403);
  }

  const user = await User.findOne({ phone: phone.trim() });
  if (!user) {
    throw new PhoneVerificationError("No account was found for this phone number. Register again.", 404);
  }

  user.phoneVerified = true;
  if (!user.email || user.emailVerified) user.status = "active";
  await user.save();

  return {
  message: "Phone verified successfully.",
  user: {
    id: user._id.toString(),
    name: user.name,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    emailVerified: user.emailVerified,
    status: user.status,
  },
};


}
