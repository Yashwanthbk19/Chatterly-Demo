import mongoose from "mongoose";

const preferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    // Story 2 - Theme Settings
    theme: {
      type: String,
      enum: ["light", "dark", "system"],
      default: "system"
    },

    // Story 3 - Chat Wallpaper
    chatWallpaper: {
      type: String,
      default: ""
    },

    // Story 4 - Notification Controls
    notifications: {
      type: Boolean,
      default: true
    },
    
    messageNotifications: {
      type: Boolean,
      default: true
    },

    groupNotifications: {
      type: Boolean,
      default: true
    },

    callNotifications: {
      type: Boolean,
      default: true
    },

    soundEnabled: {
      type: Boolean,
      default: true
    },

    notificationTone: {
      type: String,
      enum: ["Default", "Chime", "Bell", "Pop"],
      default: "Default"
    },

    vibrationEnabled: {
      type: Boolean,
      default: true
    },

    popupPreview: {
      type: Boolean,
      default: true
    },

    // Story 5 - Data Usage & Storage Settings
    mediaUploadQuality: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium"
    },

    storageUsed: {
      type: Number,
      default: 0
    },

    cacheClearedAt: {
      type: Date,
      default: null
    },

    // Story 5 - Auto Download Settings
    mobileData: {
      photos: {
        type: Boolean,
        default: false
      },
      videos: {
        type: Boolean,
        default: false
      },
      documents: {
        type: Boolean,
        default: false
      }
    },

    wifi: {
      photos: {
        type: Boolean,
        default: true
      },
      videos: {
        type: Boolean,
        default: true
      },
      documents: {
        type: Boolean,
        default: true
      }
    },

    roaming: {
      allMedia: {
        type: Boolean,
        default: false
      }
    },

    autoDownloadMedia: {
      type: Boolean,
      default: true
    },

    mediaDownloadType: {
      type: String,
      enum: ["wifi", "mobile", "never"],
      default: "wifi"
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Preference", preferenceSchema);