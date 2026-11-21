import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    createBugReport,
    getBugReports,
    assignBugDeveloper,
    resolveBugReport,
} from "../controllers/bugController.js";

const router = express.Router();

router.post("/bugs", authMiddleware, createBugReport);
router.get("/bugs", authMiddleware, getBugReports);
router.patch("/bugs/:id/assign", authMiddleware, assignBugDeveloper);
router.patch("/bugs/:id/resolve", authMiddleware, resolveBugReport);

export default router;
