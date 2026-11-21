import mongoose from "mongoose";

const releaseChecklistSchema = new mongoose.Schema(
  {
    criticalBugsFixed: {
      type: Boolean,
      default: false,
    },

    loadTestingPassed: {
      type: Boolean,
      default: false,
    },

    securityAuditApproved: {
      type: Boolean,
      default: false,
    },

    backupRecoveryTested: {
      type: Boolean,
      default: false,
    },

    monitoringAlertsConfigured: {
      type: Boolean,
      default: false,
    },

    approvalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    releaseStatus: {
      type: String,
      enum: ["Pending", "Ready", "Live", "Rolled Back"],
      default: "Pending",
    },

    rollbackPlan: {
      type: String,
      default: "",
      trim: true
    },

    releasedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default mongoose.model("ReleaseChecklist", releaseChecklistSchema);