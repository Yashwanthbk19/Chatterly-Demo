import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {initiateCall} from "../controllers/callController.js";

const router = express.Router();

router.post("/start", authMiddleware, initiateCall);

export default router;
