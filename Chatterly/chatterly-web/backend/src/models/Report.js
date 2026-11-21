import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    reportedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    reportedGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null
    },

    reason: {
      type: String,
      enum: ["Spam", "Harassment", "Fake Profile", "Other"],
      required: true
    },

    description: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: ["Pending", "Reviewed", "Rejected"],
      default: "Pending"
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model("Report", reportSchema);
