import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    createGroupAddedNotificationApi,
    createGroupRemovedNotificationApi
} from "../controllers/notificationController.js";

const router = express.Router();

router.post("/group-added", authMiddleware, createGroupAddedNotificationApi);
router.post("/group-removed", authMiddleware, createGroupRemovedNotificationApi);

export default router;
