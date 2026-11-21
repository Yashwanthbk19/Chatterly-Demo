import express from "express";
import {
  getAllReports,
  updateReportStatus
} from "../controllers/adminReportController.js";

const router = express.Router();

router.get("/reports", getAllReports);
router.put("/reports/:id", updateReportStatus);

export default router;
