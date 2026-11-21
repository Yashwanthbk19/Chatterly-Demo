import express from "express";
import {
    createGroup,
    getGroupDetails,
    searchGroups,
    assignModerator,
    removeModerator,
    addParticipants,
    removeParticipant,
    getMyGroups,
    leaveGroup,
    deleteGroup,
    updateGroupInfo,
    changeGroupPhoto,
    sendGroupMessage,
    getGroupMessages,
    sendGroupFile,
    sendGroupMedia,
    updateGroupSettings,
    removeGroupPhoto,
    pinMessage,
    unpinMessage,
    getPinnedMessages,
    updateGroupRules,
    getGroupRules,
    assignAdmin,
    removeAdmin,
    muteMember,
    unmuteMember,
    generateInviteLink,
    getInviteDetails,
    joinGroupByInvite,
    revokeInviteLink,
    pinGroup,
    unpinGroup,
    clearGroupChat,
    deleteGroupChatForMe,
    requestToJoinGroup,
    getGroupJoinRequests,
    reviewGroupJoinRequest,
    getGroupPermissions,
    updateGroupPermissions
} from "../controllers/groupController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// Group Management
router.post("/create", authMiddleware, createGroup);
router.get("/search", authMiddleware, searchGroups);
router.get("/my-groups", authMiddleware, getMyGroups);
router.post("/pin-group", authMiddleware, pinGroup);
router.post("/unpin-group", authMiddleware, unpinGroup);
router.post("/clear-chat", authMiddleware, clearGroupChat);
router.post("/delete-chat", authMiddleware, deleteGroupChatForMe);

// Group Information
router.put("/update", authMiddleware, updateGroupInfo);
router.put("/change-photo", authMiddleware, changeGroupPhoto);
router.delete("/remove-photo", authMiddleware, removeGroupPhoto);

// Group Members
router.put("/add-participants", authMiddleware, addParticipants);
router.put("/remove-participant", authMiddleware, removeParticipant);
router.put("/leave", authMiddleware, leaveGroup);
router.delete("/delete/:groupId", authMiddleware, deleteGroup);

// Group Roles
router.post("/assign-admin", authMiddleware, assignAdmin);
router.post("/remove-admin", authMiddleware, removeAdmin);
router.post("/assign-moderator", authMiddleware, assignModerator);
router.post("/remove-moderator", authMiddleware, removeModerator);

// Group Permissions
router.put("/admin-message", authMiddleware, updateGroupSettings);
router.post("/mute-member", authMiddleware, muteMember);
router.post("/unmute-member", authMiddleware, unmuteMember);

// Group Rules
router.put("/update-rules", authMiddleware, updateGroupRules);
router.get("/rules/:groupId", authMiddleware, getGroupRules);

// Group Messages
router.post("/send-message", authMiddleware, sendGroupMessage);
router.post("/send-file", authMiddleware, sendGroupFile);
router.post("/send-media", authMiddleware, sendGroupMedia);
router.get("/messages/:groupId", authMiddleware, getGroupMessages);

// Pinned Messages
router.post("/pin-message", authMiddleware, pinMessage);
router.post("/unpin-message", authMiddleware, unpinMessage);
router.get("/pinned-messages/:groupId", authMiddleware, getPinnedMessages);

// Group Invite Links
router.post("/:groupId/invite-link", authMiddleware, generateInviteLink);
router.get("/invite/:token", authMiddleware, getInviteDetails);
router.post("/invite/:token/join", authMiddleware, joinGroupByInvite);
router.delete("/:groupId/invite-link", authMiddleware, revokeInviteLink);

// Group join requests
router.post("/:groupId/join-requests", authMiddleware, requestToJoinGroup);
router.get("/:groupId/join-requests", authMiddleware, getGroupJoinRequests);
router.put("/:groupId/join-requests/:requestId/review", authMiddleware, reviewGroupJoinRequest);

// Group Permission Management
router.get("/permissions/:groupId", authMiddleware, getGroupPermissions);
router.put("/permissions/:groupId", authMiddleware, updateGroupPermissions);

// Keep it last (Group information)
router.get("/:groupId", authMiddleware, getGroupDetails);

export default router;
