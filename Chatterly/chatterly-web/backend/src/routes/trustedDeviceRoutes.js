import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    registerDevice,
    verifyDevice,
    getDevices,
    removeDevice
} from "../controllers/trustedDeviceController.js";

const router = express.Router();

router.post("/register", authMiddleware, registerDevice);
router.post("/verify", authMiddleware, verifyDevice);
router.get("/list", authMiddleware, getDevices);
router.delete("/:deviceId", authMiddleware, removeDevice);

export default router;
