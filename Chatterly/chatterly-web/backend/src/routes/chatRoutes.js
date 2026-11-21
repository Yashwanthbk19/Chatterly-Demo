import express from "express";
import {
  startChat,
  sendMessageAPI,
  sendMediaMessage,
  getMessagesByChat,
  getChatList,
  archiveChat,
  unarchiveChat,
  searchUsers,
  deleteMessageForMe,
  deleteMessageForEveryone,
  deleteChat,
  saveToken,
  notify,
  sendFileMessage,
  getFileMessages,
  downloadFile,
  getUserProfileView,
  getSharedMedia,
  getSharedLinks,
  forwardMessage,
  pinMessage,
  unpinMessage,
  getPinnedMessages,
  markChatUnread,
  markChatRead,
  setDisappearingTimer,
  pinChat,
  unpinChat,
  clearChat
} from "../controllers/chatController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// Chat Management
router.post("/start", authMiddleware, startChat);
router.get("/list", authMiddleware, getChatList);
router.post("/archive", authMiddleware, archiveChat);
router.post("/unarchive", authMiddleware, unarchiveChat);
router.post("/delete", authMiddleware, deleteChat);
router.post("/mark-read", authMiddleware, markChatRead);
router.put("/mark-unread", authMiddleware, markChatUnread);
router.post("/pin-chat", authMiddleware, pinChat);
router.post("/unpin-chat", authMiddleware, unpinChat);
router.post("/clear", authMiddleware, clearChat);

// Messages
router.post("/send", authMiddleware, sendMessageAPI); // fallback
router.post("/send-media", authMiddleware, sendMediaMessage);
router.post("/send-file",authMiddleware, sendFileMessage);
router.post("/forward", authMiddleware, forwardMessage);
router.get("/messages/:chatId", authMiddleware, getMessagesByChat);

// Message Management
router.post("/message/delete/me", authMiddleware, deleteMessageForMe);
router.post("/message/delete/everyone", authMiddleware, deleteMessageForEveryone);

// Pinned Messages
router.post("/pin", authMiddleware, pinMessage);
router.post("/unpin", authMiddleware, unpinMessage);
router.get("/pinned/:chatId", authMiddleware, getPinnedMessages);

// File Sharing
router.get("/download/:id",authMiddleware, downloadFile);
router.get("/files/:chatId",authMiddleware, getFileMessages);

// Shared Media
router.get("/profile/:userId", authMiddleware, getUserProfileView);
router.get("/profile/:userId/media", authMiddleware, getSharedMedia);
router.get("/profile/:userId/link", authMiddleware, getSharedLinks);

// Contacts
router.get("/contacts/search", authMiddleware, searchUsers);

// Save user FCM token Notifications
router.post("/save-token", authMiddleware, saveToken);
router.post("/notify",authMiddleware,  notify);

// Disappearing Messages
router.post("/set-disappearing-timer",setDisappearingTimer);

export default router;
