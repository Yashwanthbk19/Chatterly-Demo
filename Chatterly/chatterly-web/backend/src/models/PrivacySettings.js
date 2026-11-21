import mongoose from "mongoose";

const privacySettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    encryptionEnabled: {
      type: Boolean,
      default: true
    },

    disappearingMessages: {
      type: String,
      enum: ["off", "24h", "7d", "30d"],
      default: "off"
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("PrivacySettings", privacySettingsSchema);
