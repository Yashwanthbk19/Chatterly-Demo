import Joi from "joi";

// ✅ Email OTP Send
export const sendOtpSchema = Joi.object({
  email: Joi.string().email().required(),
});

// ✅ Verify OTP + Register
export const verifyOtpSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(),
  deviceId: Joi.string().optional(),
  deviceName: Joi.string().optional(),
  platform: Joi.string()
      .valid("android", "ios", "web")
      .optional(),
  browser: Joi.string().optional()
});

// Resend email OTP
export const resendEmailOtpSchema = Joi.object({
  email: Joi.string().email().required()
});

// ✅ Create Profile
export const createProfileSchema = Joi.object({
  name: Joi.string().min(2).required(),
  avatar: Joi.string().uri().optional(),
  status: Joi.string().optional(),
});

export const completeLogin2FASchema = Joi.object({
  userId: Joi.string().required(),
  // Authenticator
  authOTP: Joi.string().optional(),
  // Firebase SMS
  idToken: Joi.string().optional(),

  trustDevice: Joi.boolean().optional(),
  deviceId: Joi.string().optional(),
  deviceName: Joi.string().optional(),
  platform: Joi.string()
    .valid("android", "ios", "web")
    .optional(),
  browser: Joi.string().optional()
}).or("authOTP", "idToken");
