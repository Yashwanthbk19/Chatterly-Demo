import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  createBroadcast,
  getBroadcastDetails,
  getMyBroadcastLists,
  sendBroadcastMessage,
  addBroadcastMember,
  removeBroadcastMember,
  deleteBroadcast
} from "../controllers/broadcastController.js";

const router = express.Router();

router.post("/create", authMiddleware, createBroadcast);
router.get("/my-lists", authMiddleware, getMyBroadcastLists);
router.post("/send", authMiddleware, sendBroadcastMessage);
router.post("/add-member", authMiddleware, addBroadcastMember);
router.post("/remove-member", authMiddleware, removeBroadcastMember);
router.get("/:broadcastId", authMiddleware, getBroadcastDetails);
router.delete("/delete-broadcast", authMiddleware, deleteBroadcast);

export default router;
