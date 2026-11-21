import express from "express";
import {
  reportUser,
  reportGroup
} from "../controllers/reportController.js";

const router = express.Router();

router.post("/report-user", reportUser);
router.post("/report-group", reportGroup);

export default router;
