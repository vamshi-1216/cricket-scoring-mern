
import { Router } from "express";

import {
  register,
  sendEmailOtpHandler,
  verifyEmailOtpHandler,
  verifyPhoneOtpHandler,
  googleSignInHandler,
  getCurrentUserHandler,
  logoutHandler,
  loginHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  verifyPhoneForPasswordResetHandler,
resetPasswordWithPhoneHandler
} from "./user.controller.js";

import { requireAuth } from "../../middleware/require-auth.js";


const router = Router();

// Registration
router.post("/register", register);

// Email verification
router.post("/send-email-otp", sendEmailOtpHandler);
router.post("/verify-email-otp", verifyEmailOtpHandler);

// Phone verification
router.post("/verify-phone-otp", verifyPhoneOtpHandler);

// Password and Google authentication
router.post("/login", loginHandler);
router.post("/google", googleSignInHandler);

// Authenticated session
router.get("/me", requireAuth, getCurrentUserHandler);

// Logout
router.post("/logout", logoutHandler);

router.post("/forgot-password", forgotPasswordHandler);
router.post("/reset-password", resetPasswordHandler);
router.post(
  "/forgot-password/verify-phone",
  verifyPhoneForPasswordResetHandler
);

router.post(
  "/reset-password/phone",
  resetPasswordWithPhoneHandler
);
export default router;
