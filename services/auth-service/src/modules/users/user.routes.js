
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
  resetPasswordWithPhoneHandler,
  updateCurrentUserProfileHandler,
  getScoringTransferTargetHandler,
  getInternalScoringTransferTargetHandler,
  searchScoringTransferTargetsHandler,
} from "./user.controller.js";

import { requireAuth } from "../../middleware/require-auth.js";
import { requireInternalService } from "../../middleware/require-internal-service.js";


const router = Router();

function preventCaching(req, res, next) {
  res.set("Cache-Control", "no-store");
  delete req.headers["if-none-match"];
  delete req.headers["if-modified-since"];
  next();
}

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
router.get("/me", preventCaching, requireAuth, getCurrentUserHandler);
router.get(
  "/internal/scoring-transfer-targets/:userId",
  requireInternalService,
  getInternalScoringTransferTargetHandler
);
router.get("/scoring-transfer-targets", requireAuth, searchScoringTransferTargetsHandler);
router.get("/scoring-transfer-targets/:userId", requireAuth, getScoringTransferTargetHandler);

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
router.patch("/me", requireAuth, updateCurrentUserProfileHandler);

export default router;
