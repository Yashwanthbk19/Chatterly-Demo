import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    createLoadTest,
    getLoadTest
} from "../controllers/loadTestController.js";

const router = express.Router();

router.post("/loadtest", authMiddleware, createLoadTest);
router.get("/loadtest/:id", authMiddleware, getLoadTest);

export default router;
