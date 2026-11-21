import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  enable2FA,
  disable2FA,
  verifyBackupCode,
  setupAuthenticator,
  verifyAuthenticator
} from "../controllers/twoFactorController.js";

const router = express.Router();

router.post("/enable", authMiddleware, enable2FA);
router.post("/disable", authMiddleware, disable2FA);
router.post("/verify-backup-code", authMiddleware, verifyBackupCode);
router.post("/authenticator/setup", authMiddleware, setupAuthenticator);
router.post("/authenticator/verify", authMiddleware, verifyAuthenticator);

export default router;
