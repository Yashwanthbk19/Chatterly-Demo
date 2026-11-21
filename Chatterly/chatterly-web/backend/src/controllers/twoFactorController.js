import User from "../models/User.js";
import crypto from "crypto";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

const generateBackupCodes = () => {
  return Array.from({ length: 8 }, () =>
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
};

// Enable 2FA
export const enable2FA = async (req, res) => {
  try {
    const { method = "sms" } = req.body;

    if (!["sms", "authenticator"].includes(method)) {
      return res.status(400).json({
        success: false,
        message: "Invalid 2FA method"
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: "2FA is already enabled"
      });
    }

    user.twoFactorEnabled = true;
    user.twoFactorMethod = method;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "2FA enabled successfully"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Setup authenticator
export const setupAuthenticator = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const secret = speakeasy.generateSecret({
      name: `Chatterly (${user.email || user.phone})`
    });

    user.authenticatorSecret = secret.base32;
    user.twoFactorMethod = "authenticator";

    await user.save();

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return res.status(200).json({
      success: true,
      qrCode,
      manualKey: secret.base32
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Disable 2FA
export const disable2FA = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        message: "2FA is already disabled"
      });
    }

    user.twoFactorEnabled = false;
    user.twoFactorMethod = "sms";
    user.twoFactorOtp = null;
    user.twoFactorOtpExpires = null;
    user.authenticatorSecret = null;
    user.backupCodes = [];

    await user.save();

    res.json({
      success: true,
      message: "2FA disabled successfully"
    });
  }
  catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Verify authenticator
export const verifyAuthenticator = async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.authenticatorSecret,
      encoding: "base32",
      token
    });

    if (!verified) {
      return res.status(400).json({
        success: false,
        message: "Invalid authenticator code"
      });
    }

    user.backupCodes = generateBackupCodes();

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Authenticator verified",
      backupCodes: user.backupCodes
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Verify backup codes
export const verifyBackupCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Backup code is required"
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const index = user.backupCodes.indexOf(code);

    if (index === -1) {
      return res.status(400).json({
        success: false,
        message: "Invalid backup code"
      });
    }

    // Remove used backup code
    user.backupCodes.splice(index, 1);

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Backup code verified successfully"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
