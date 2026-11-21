import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },

    email: {
      type: String,
      unique: true,
      sparse: true, // ✅ allows null
      lowercase: true,
      default: undefined,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      required: false,
      trim: true,
      index: true,
    },

    profilePic: {
      type: String,
      default: "https://ui-avatars.com/api/?name=",
    },

    authProvider: {
      type: String,
      enum: ["email", "phone", "google"],
      required: true,
    },

    isProfileComplete: {
      type: Boolean,
      default: false,
    },

    isVerified: {
      type: Boolean,
      default: false
    },

    status: {
      type: String,
      default: "offline"
    },

    lastSeen: {
      type: Date,
      default: Date.now
    },

    publicKey: {
      type: String,
      default: "" 
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false
    },

    twoFactorMethod: {
      type: String,
      enum: ["sms", "authenticator"],
      default: "sms"
    },

    authenticatorSecret: {
      type: String,
      default: null
    },

    // Temporary OTP storage
    twoFactorOtp: {
      type: String,
      default: null
    },

    twoFactorOtpExpires: {
      type: Date,
      default: null
    },

    // Recovery backup codes
    backupCodes: [{
      type: String
    }],

    blockedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User" 
    }],

    blockedBy: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }],

    settings: {
      darkMode: {
        type: Boolean,
        default: false
      }
    },

    fcmToken: {
      type: String,
      default: null
    },

    fcmStatus: {
      type: Boolean,
      default: false,
    },
    reportCount: {
      type: Number,
      default: 0
    },

    isFlagged: {
      type: Boolean,
      default: false
    },

    isSuspended: {
      type: Boolean,
      default: false
    },

    platform: {
      type: String,
      enum: ["android", "ios"],
      default: "android",
      index: true,
    },
  },

  { timestamps: true },
);

export default mongoose.model("User", userSchema);