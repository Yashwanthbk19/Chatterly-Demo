import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
    getRelease,
    updateRelease,
    validateReleaseChecklist,
    deployRelease
} from "../controllers/releaseController.js";

const router = express.Router();

router.get("/release", authMiddleware, getRelease);
router.patch("/release", authMiddleware, updateRelease);
router.post("/release/validate", authMiddleware, validateReleaseChecklist);
router.post("/release/go-live", authMiddleware, deployRelease);

export default router;
