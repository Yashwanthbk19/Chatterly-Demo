import express from "express";
import {
  firebasePhoneLogin,
  sendEmailOtp,
  verifyEmailOtp,
  googleLogin,
  createProfile,
  updateProfile,
  authSearchUsers,
  resendEmailOtp,
  emailVerificationStatus,
  completeLogin2FA,
  logoutUser,
  logoutAllDevices,
} from "../controllers/authController.js";
import validate from "../middleware/validate.js";
// ✅ Import schemas
import {
  sendOtpSchema,
  verifyOtpSchema,
  resendEmailOtpSchema,
  completeLogin2FASchema
} from "../validators/authValidator.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// PHONE LOGIN
router.post("/phone-login", firebasePhoneLogin);

// EMAIL OTP
router.post("/send-email-otp", validate(sendOtpSchema), sendEmailOtp);
router.post("/verify-email-otp", validate(verifyOtpSchema), verifyEmailOtp);
router.post("/resend-email-otp", validate(resendEmailOtpSchema), resendEmailOtp);
router.get("/email-verification-status", authMiddleware, emailVerificationStatus);

// 2fa login
router.post("/complete-login-2fa", validate(completeLogin2FASchema), completeLogin2FA);

// SOCIAL
router.post("/google-login", googleLogin);

// PROFILE
router.post("/create-profile", authMiddleware, createProfile);
router.patch("/update-profile", authMiddleware, updateProfile);

// Logout
router.post("/logout", authMiddleware, logoutUser);
router.post("/logout-all", authMiddleware, logoutAllDevices); // All devices

// Search
router.get("/search-users", authSearchUsers);

export default router;
