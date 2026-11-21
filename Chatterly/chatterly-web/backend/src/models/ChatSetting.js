import mongoose from "mongoose";

const chatSettingSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    disappearingTimer: {
      type: String,
      enum: ["off", "24h", "7d", "30d"],
      default: "off"
    },

    expiresAt: {
      type: Date,
      default: null,
      index: {
        expireAfterSeconds: 0
      }
    },
  },
  {
    timestamps: true
  }
);

export default mongoose.model(
  "ChatSetting",
  chatSettingSchema
);