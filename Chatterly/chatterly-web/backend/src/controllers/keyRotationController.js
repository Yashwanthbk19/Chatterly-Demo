import User from "../models/User.js";

export const rotateKeys = async (req, res) => {
  try {
    const {publicKey} = req.body;

    if (!publicKey) {
      return res.status(400).json({
        success: false,
        message: "Public key is required"
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    user.publicKey = publicKey;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Public key rotated successfully"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
