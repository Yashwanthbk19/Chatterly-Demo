import express from "express";
import {
  getPerformanceDashboard,
  optimizeSystem
} from "../controllers/performanceController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/performance", authMiddleware, getPerformanceDashboard);
router.post("/performance/optimize", authMiddleware, optimizeSystem);

export default router;
