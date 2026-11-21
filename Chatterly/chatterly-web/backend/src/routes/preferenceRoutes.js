import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getPreferences,
  updatePreferences,
  getTheme,
  updateTheme,
  getChatWallpaper,
  updateChatWallpaper,
  getNotifications,
  updateNotifications,
  getDataUsageSettings,
  updateDataUsageSettings,
  getAutoDownloadSettings,
  updateAutoDownloadSettings,
  getSettings,
} from "../controllers/preferenceController.js";

const router = express.Router();

// Preferences
router.get("/", authMiddleware, getPreferences);
router.put("/", authMiddleware, updatePreferences);

// Theme
router.get("/theme", authMiddleware, getTheme);
router.put("/theme", authMiddleware, updateTheme);

// Chat Wallpaper
router.get("/chat-wallpaper", authMiddleware, getChatWallpaper);
router.put("/chat-wallpaper", authMiddleware, updateChatWallpaper);

// Notifications
router.get("/notifications", authMiddleware, getNotifications);
router.put("/notifications", authMiddleware, updateNotifications);

// Data Usage
router.get("/data-usage", authMiddleware, getDataUsageSettings);
router.put("/data-usage", authMiddleware, updateDataUsageSettings);

// Auto Download
router.get("/auto-download", authMiddleware, getAutoDownloadSettings);
router.put("/auto-download", authMiddleware, updateAutoDownloadSettings);

// Settings Summary
router.get("/settings", authMiddleware, getSettings);

export default router;
