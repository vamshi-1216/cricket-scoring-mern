
import {
  registerUser,
  RegistrationError,
} from "./user.service.js";

import {
  sendEmailOtp,
  verifyEmailOtp,
  EmailVerificationError,
} from "./email-verification.service.js";

import {
  verifyMsg91PhoneToken,
  PhoneVerificationError,
} from "./phone-verification.service.js";

import {
  authenticateWithGoogle,
  GoogleAuthError,
} from "./google-auth.service.js";

import {
  requestPasswordReset,
  resetPassword,
  PasswordResetError,
} from "./password-reset.service.js";

import {
  verifyPhoneForPasswordReset,
  resetPasswordWithPhone,
  PhonePasswordResetError,
} from "./phone-password-reset.service.js";


import { createAccessToken } from "../../utils/jwt.js";
import { env } from "../../config/env.js";
import { authenticateWithPassword, LoginError } from "./login.service.js";

// Register a new user
export async function register(req, res, next) {
  try {
    const user = await registerUser(req.body);

    return res.status(201).json({
      success: true,
      message:
        "Registration successful. Account verification is pending.",
      data: { user },
    });
  } catch (error) {
    if (error instanceof RegistrationError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

// Send email verification OTP
export async function sendEmailOtpHandler(req, res, next) {
  try {
    const result = await sendEmailOtp(req.body?.email);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

// Verify email OTP
export async function verifyEmailOtpHandler(req, res, next) {
  try {
    const result = await verifyEmailOtp(
      req.body?.email,
      req.body?.otp
    );

    return res.status(200).json({
      success: true,
      message: result.message,
      data: { user: result.user },
    });
  } catch (error) {
    if (error instanceof EmailVerificationError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

// Verify phone using the MSG91 access token
export async function verifyPhoneOtpHandler(req, res, next) {
  try {
    const result = await verifyMsg91PhoneToken({
      phone: req.body?.phone,
      accessToken: req.body?.accessToken,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: { user: result.user },
    });
  } catch (error) {
    if (error instanceof PhoneVerificationError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

// Sign in with Google and create an HTTP-only session cookie
export async function googleSignInHandler(req, res, next) {
  try {
    const user = await authenticateWithGoogle(req.body?.credential);
    const token = createAccessToken(user);

    res.cookie("access_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({
      success: true,
      message: "Google sign-in successful.",
      data: { user },
    });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

// Return the authenticated user's details
export function getCurrentUserHandler(req, res) {
  return res.status(200).json({
    success: true,
    data: { user: req.user },
  });
}

// Clear the session cookie
export function logoutHandler(req, res) {
  res.clearCookie("access_token", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
}


export async function loginHandler(req, res, next) {
  try {
    const user = await authenticateWithPassword({
      identifier: req.body?.identifier,
      password: req.body?.password,
    });

    const token = createAccessToken(user);

    res.cookie("access_token", token, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: { user },
    });
  } catch (error) {
    if (error instanceof LoginError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

export async function forgotPasswordHandler(req, res, next) {
  try {
    const result = await requestPasswordReset(req.body?.email);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

export async function resetPasswordHandler(req, res, next) {
  try {
    const result = await resetPassword(
      req.body?.token,
      req.body?.password
    );

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

export async function verifyPhoneForPasswordResetHandler(req, res, next) {
  try {
    const result = await verifyPhoneForPasswordReset({
      phone: req.body?.phone,
      accessToken: req.body?.accessToken,
    });

    return res.status(200).json({
      success: true,
      message: "Phone verified. You can now set a new password.",
      data: {
        recoveryToken: result.recoveryToken,
        expiresInSeconds: result.expiresInSeconds,
      },
    });
  } catch (error) {
    if (error instanceof PhonePasswordResetError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

export async function resetPasswordWithPhoneHandler(req, res, next) {
  try {
    const result = await resetPasswordWithPhone({
      recoveryToken: req.body?.recoveryToken,
      password: req.body?.password,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error instanceof PhonePasswordResetError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}