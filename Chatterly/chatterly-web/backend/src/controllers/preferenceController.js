import Preference from "../models/Preference.js";

// Get Preferences
export const getPreferences = async (req, res) => {
  try {

    const userId = req.user.id;

    let preference = await Preference.findOne({ userId });

    if (!preference) {
      preference = await Preference.create({ userId });
    }

    return res.status(200).json({
      success: true,
      data: preference
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Preferences
export const updatePreferences = async (req, res) => {
  try {

    const userId = req.user.id;

    const preference = await Preference.findOneAndUpdate(
      { userId },
      req.body,
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).select("-__v");

    return res.status(200).json({
      success: true,
      message: "Preferences updated successfully",
      data: preference
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Theme
export const getTheme = async (req, res) => {
  try {
    
    const userId = req.user.id;

    const preference = await Preference.findOne({
      userId
    }).select("theme")
      .lean();

    return res.status(200).json({
      success: true,
      theme: preference?.theme || "system"
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Theme
export const updateTheme = async (req, res) => {
  try {
    
    const userId = req.user.id;

    const preference = await Preference.findOneAndUpdate(
      { userId },
      { theme: req.body.theme },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).select("theme");

    return res.status(200).json({
      success: true,
      message: "Theme updated successfully",
      theme: preference.theme
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Chat Wallpaper
export const getChatWallpaper = async (req, res) => {
  try {

    const userId = req.user.id;

    const preference = await Preference.findOne({
      userId
    }).select("chatWallpaper")
      .lean();

    return res.status(200).json({
      success: true,
      chatWallpaper: preference?.chatWallpaper || ""
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Chat Wallpaper
export const updateChatWallpaper = async (req, res) => {
  try {
    
    const userId = req.user.id;

    const preference = await Preference.findOneAndUpdate(
      { userId },
      { chatWallpaper: req.body.chatWallpaper },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).select("chatWallpaper");

    return res.status(200).json({
      success: true,
      message: "Chat wallpaper updated successfully",
      chatWallpaper: preference.chatWallpaper
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

//Get Notifications
export const getNotifications = async (req, res) => {
  try {
    
    const userId = req.user.id;

    const preference = await Preference.findOne({
      userId
    }).select(
      "notifications messageNotifications groupNotifications callNotifications soundEnabled notificationTone vibrationEnabled popupPreview"
    )
      .lean();

    return res.status(200).json({
      success: true,
      data: preference
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

//Update Notifications
export const updateNotifications = async (req, res) => {
  try {
        
    const userId = req.user.id;

    const preference = await Preference.findOneAndUpdate(
      { userId },
      req.body,
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).select(
      "notifications messageNotifications groupNotifications callNotifications soundEnabled notificationTone vibrationEnabled popupPreview"
    );

    return res.status(200).json({
      success: true,
      message: "Notification settings updated successfully",
      data: preference
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Data Usage & Storage Settings
export const getDataUsageSettings = async (req, res) => {
  try {
        
    const userId = req.user.id;

    const preference = await Preference.findOne(
      { userId },
      "mediaUploadQuality storageUsed cacheClearedAt"
    ).lean();

    return res.status(200).json({
      success: true,
      data: preference
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Data Usage & Storage Settings
export const updateDataUsageSettings = async (req, res) => {
  try {
        
    const userId = req.user.id;

    const preference = await Preference.findOneAndUpdate(
      { userId },
      req.body,
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).select("mediaUploadQuality storageUsed cacheClearedAt");

    return res.status(200).json({
      success: true,
      message: "Data usage settings updated successfully",
      data: preference
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Auto Download Settings
export const getAutoDownloadSettings = async (req, res) => {
  try {
        
    const userId = req.user.id;

    const preference = await Preference.findOne(
      { userId },
      "mobileData wifi roaming"
    ).lean();

    return res.status(200).json({
      success: true,
      data: preference
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update Auto Download Settings
export const updateAutoDownloadSettings = async (req, res) => {
  try {
        
    const userId = req.user.id;

    const { mobileData, wifi, roaming } = req.body;

    const preference = await Preference.findOneAndUpdate(
      { userId },
      { mobileData, wifi, roaming },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).select("mobileData wifi roaming");

    return res.status(200).json({
      success: true,
      message: "Auto download settings updated successfully",
      data: preference
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get Main Settings Screen
export const getSettings = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: [
        { key: "profile", title: "Profile" },
        { key: "theme", title: "Theme" },
        { key: "chatWallpaper", title: "Chat Wallpaper" },
        { key: "notifications", title: "Notifications" },
        { key: "privacySecurity", title: "Privacy & Security" },
        { key: "dataUsage", title: "Data Usage & Storage" },
        { key: "autoDownload", title: "Auto Download Media" },
        { key: "logout", title: "Logout" }
      ],
      appVersion: "v1.0.0"
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
