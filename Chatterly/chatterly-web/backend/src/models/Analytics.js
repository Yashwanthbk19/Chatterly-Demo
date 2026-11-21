import mongoose from "mongoose";

const analyticsSchema = new mongoose.Schema(
  {
    dailyActiveUsers: {
      type: Number,
      default: 0,
      required: true
    },

    messageDeliveryRate: {
      type: Number,
      default: 100,
      required: true
    },

    callSuccessRate: {
      type: Number,
      default: 100,
      required: true
    },

    notificationSuccessRate: {
      type: Number,
      default: 100,
      required: true
    },

    crashReports: {
      type: Number,
      default: 0,
      required: true
    },

    androidUsers: {
      type: Number,
      default: 0,
      required: true
    },

    iosUsers: {
      type: Number,
      default: 0,
      required: true
    },

    snapshotDate: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Analytics", analyticsSchema);