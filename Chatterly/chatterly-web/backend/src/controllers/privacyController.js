import PrivacySettings from "../models/PrivacySettings.js";
import User from "../models/User.js";
import crypto from "crypto";

// Settings
export const getPrivacySettings = async (req, res) => {
  try {
    let settings = await PrivacySettings.findOne({
      userId: req.user.id,
    });

    if (!settings) {
      settings = await PrivacySettings.create({
        userId: req.user.id,
      });
    }

    const user = await User.findById(req.user.id).select(
      "twoFactorEnabled blockedUsers"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        encryptionEnabled: settings.encryptionEnabled,
        twoFactorEnabled: user.twoFactorEnabled,
        blockedUsersCount: user.blockedUsers.length,
        disappearingMessages: settings.disappearingMessages,
      },
    });
  }
  catch (error) {
    console.error("Privacy Settings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch settings",
      error: error.message,
    });
  }
};

// Encryption info
export const getEncryptionInfo = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        enabled: true,
        title: "End-to-End Encryption",
        description:
          "Your messages, calls, media, and shared files are secured with end-to-end encryption. Only you and the recipient can read them. Not even Chatterly can access the content."
      }
    });
  }
  catch (error) {
    console.error("Encryption Info Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch encryption information"
    });
  }
};

// Encryption details
export const getEncryptionDetails = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        messagesEncrypted: true,
        callsEncrypted: true,
        mediaEncrypted: true,
        filesEncrypted: true,
        serverCanReadMessages: false,
        keyExchange: "ECDH",
        encryptionAlgorithm: "AES-256"
      }
    });
  } catch (error) {
    console.error("Encryption Details Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch encryption details"
    });
  }
};

// Security code
export const getSecurityCode = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUser = await User.findById(req.user.id);
    const otherUser = await User.findById(userId);

    if (!currentUser || !otherUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!currentUser.publicKey || !otherUser.publicKey) {
      return res.status(400).json({
        success: false,
        message: "Both users must exchange encryption keys first"
      });
    }

    const combinedKeys = [
      currentUser.publicKey,
      otherUser.publicKey
    ]
    .sort()
    .join("-");

    const securityCode = crypto
      .createHash("sha256")
      .update(combinedKeys)
      .digest("hex")
      .substring(0, 24)
      .toUpperCase()
      .match(/.{1,4}/g)
      .join("-");

    return res.status(200).json({
      success: true,
      data: {
        securityCode
      }
    });

  } catch (error) {
    console.error("Security Code Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate security code"
    });
  }
};

// UPDATE SETTINGS
export const updatePrivacySettings =async (req, res) => {
  try {
    const {disappearingMessages} = req.body;

    let settings = await PrivacySettings.findOne({
      userId: req.user.id
    });

    if (!settings) {
      settings = await PrivacySettings.create({
        userId: req.user.id
      });
    }

    if (disappearingMessages !== undefined) {
      const allowedValues = ["off", "24h", "7d", "30d"];

      if (!allowedValues.includes(disappearingMessages)) {
        return res.status(400).json({
          success: false,
          message: "Invalid disappearing message, option = off, 24h, 7d, 30d"
        });
      }

  settings.disappearingMessages = disappearingMessages;
}

    await settings.save();

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      data: settings
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update settings",
      error: error.message
    });
  }
};
