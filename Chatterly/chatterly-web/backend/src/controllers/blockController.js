import User from "../models/User.js";

// Block User
export const blockUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { blockedUserId } = req.body;

    if (!blockedUserId) {
      return res.status(400).json({
        success: false,
        message: "Blocked User ID required"
      });
    }

    if (userId === blockedUserId) {
      return res.status(400).json({
        success: false,
        message: "You cannot block yourself"
      });
    }

    const user = await User.findById(userId);
    const blockedUser = await User.findById(blockedUserId);

    if (!blockedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (
      user.blockedUsers.includes(blockedUserId)
    ) {
      return res.status(400).json({
        success: false,
        message: "User already blocked"
      });
    }

    user.blockedUsers.push(blockedUserId);
    blockedUser.blockedBy.push(userId);

    await user.save();
    await blockedUser.save();

    return res.status(200).json({
      success: true,
      message: "User blocked successfully"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Unblock User
export const unblockUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { blockedUserId } = req.body;
    const user = await User.findById(userId);
    const blockedUser = await User.findById(blockedUserId);

    if (!blockedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    user.blockedUsers =
      user.blockedUsers.filter(
        id => id.toString() !== blockedUserId
      );

    blockedUser.blockedBy =
      blockedUser.blockedBy.filter(
        id => id.toString() !== userId
      );

    await user.save();
    await blockedUser.save();

    return res.status(200).json({
      success: true,
      message: "User unblocked successfully"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// View Blocked Users
export const getBlockedUsers = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId)
      .populate(
        "blockedUsers",
        "name email phone profilePic"
      );

    return res.status(200).json({
      success: true,
      blockedUsers: user.blockedUsers
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
