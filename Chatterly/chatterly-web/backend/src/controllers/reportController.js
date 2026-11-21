import Report from "../models/Report.js";
import User from "../models/User.js";
import Group from "../models/Group.js";

// Report user
export const reportUser = async (req, res) => {
  try {
    const {
      reporterId,
      reportedUserId,
      reason,
      description
    } = req.body;

    if (
      !reporterId ||
      !reportedUserId ||
      !reason
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    if (reporterId === reportedUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot report yourself"
      });
    }

    const user = await User.findById(reportedUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const report = await Report.create({
      reporterId,
      reportedUserId,
      reason,
      description
    });

    user.reportCount += 1;

    if (user.reportCount >= 3) {
      user.isFlagged = true;
    }

    if (user.reportCount >= 10) {
      user.isSuspended = true;
    }

    await user.save();

    console.log(
      `Admin Alert: New report against ${reportedUserId}`
    );

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      report
    });
  }
  catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// REPORT GROUP
export const reportGroup = async (req, res) => {
  try {
    const {
      reporterId,
      reportedGroupId,
      reason,
      description
    } = req.body;

    if (!reporterId || !reportedGroupId || !reason) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const group = await Group.findById(reportedGroupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    const report = await Report.create({
      reporterId,
      reportedGroupId,
      reason,
      description
    });

    group.reportCount += 1;

    if (group.reportCount >= 3) {
      group.isFlagged = true;
    }

    if (group.reportCount >= 10) {
      group.isSuspended = true;
    }

    await group.save();

    console.log(
      `Admin Alert: New report against group ${reportedGroupId}`
    );

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      report
    });
  }
  catch (error) {
    console.error("Report Group Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
