import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import { rotateKeys } from "../controllers/keyRotationController.js";

const router = express.Router();

router.post("/rotate", authMiddleware, rotateKeys);

export default router;
