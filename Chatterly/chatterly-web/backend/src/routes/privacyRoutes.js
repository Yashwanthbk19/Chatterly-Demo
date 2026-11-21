import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getPrivacySettings,
  getEncryptionInfo,
  getEncryptionDetails,
  getSecurityCode,
  updatePrivacySettings
} from "../controllers/privacyController.js";

const router = express.Router();

router.get("/settings", authMiddleware, getPrivacySettings);
router.get("/encryption-info", authMiddleware, getEncryptionInfo);
router.get("/encryption-details", authMiddleware, getEncryptionDetails);
router.get("/security-code/:userId", authMiddleware, getSecurityCode);
router.put("/settings", authMiddleware, updatePrivacySettings);

export default router;
