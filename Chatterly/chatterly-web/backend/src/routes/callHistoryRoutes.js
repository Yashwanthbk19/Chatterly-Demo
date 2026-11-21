import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    getHistory,
    getDetails,
    getMissedCount,
    quickRedial
} from "../controllers/callHistoryController.js";

const router = express.Router();

router.get("/history", authMiddleware, getHistory);
router.get("/details/:id", authMiddleware, getDetails);
router.get("/missed-count", authMiddleware, getMissedCount);
router.get("/redial/:id", authMiddleware, quickRedial);

export default router;
