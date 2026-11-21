import Group from "../models/Group.js";
import User from "../models/User.js";
import multer from "multer";
import {PutObjectCommand} from "@aws-sdk/client-s3";
import s3 from "../config/s3.js";
import Message from "../models/Message.js";
import mongoose from "mongoose";
import deleteMediaFromS3 from "../utils/s3Delete.js";
import {
    createGroupAddedNotification,
    createGroupRemovedNotification
}from "../services/notificationService.js";
import { getIO } from "../sockets/socketServer.js";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { compressVideoInBackground } from "../jobs/mediaCompressionJob.js";
import redisClient from "../config/redis.js";
import JoinRequest from "../models/JoinRequest.js";

ffmpeg.setFfmpegPath(ffmpegPath);

// Size
const MB = 1024 * 1024;

const MAX_IMAGE_SIZE = Number(process.env.MAX_IMAGE_SIZE_MB || 20) * MB;
const MAX_VIDEO_SIZE = Number(process.env.MAX_VIDEO_SIZE_MB || 500) * MB;
const MAX_AUDIO_SIZE = Number(process.env.MAX_AUDIO_SIZE_MB || 200) * MB;
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_MB || 500) * MB;

// MULTER CONFIGURATION
const allowedFileFilter = (req, file, cb) => {

  const allowedTypes = [
    // Gif
    "image/gif",

    // Images
    "image/jpeg",
    "image/png",
    "image/webp",

    // Videos
    "video/mp4",
    "video/mpeg",

    // Audios
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/aac",

    // Docs
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/x-zip-compressed",
    "text/plain",
    "text/vcard",
    "text/x-vcard",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } 
  else {
    cb(
      new Error("Unsupported file type"),
      false
    );
  }
};

const mediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: Math.max(
            MAX_IMAGE_SIZE,
            MAX_VIDEO_SIZE,
            MAX_AUDIO_SIZE
        )
    },
    fileFilter: (req, file, cb) => {
        allowedFileFilter(req, file, (err) => {
            if (err) {
                return cb(err, false);
            }

            let maxSize = MAX_VIDEO_SIZE;

            if (file.mimetype.startsWith("image/")) {
                maxSize = MAX_IMAGE_SIZE;
            }
            else if (file.mimetype.startsWith("audio/")) {
                maxSize = MAX_AUDIO_SIZE;
            }   
            else if (file.mimetype.startsWith("video/")) {
                maxSize = MAX_VIDEO_SIZE;
            }

            req.maxAllowedSize = maxSize;

            cb(null, true);
        });
    }
}).single("media");

const fileUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_FILE_SIZE
    },
    fileFilter: allowedFileFilter
}).single("file");

// CREATE GROUP
export const createGroup = async (req, res) => {
    mediaUpload (req, res, async (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }

        try {
            const {groupName, description, participants} = req.body;
            const createdBy = req.user.id;

            if (!groupName) {
                return res.status(400).json({
                    success: false,
                    message: "Group name is required"
                });
            }

            if (groupName.trim().length > 50) {
                return res.status(400).json({
                    success: false,
                    message: "Group name cannot exceed 50 characters"
                });
            }

            let participantArray = [];

            if (Array.isArray (participants)) {
                participantArray = participants;
            }
            else {
                participantArray =[participants];
            }

            if (participantArray.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: "Minimum 2 participants required"
                });
            }

            const uniqueParticipants = [...new Set(participantArray)];

            if (!uniqueParticipants.includes(createdBy)) {
                uniqueParticipants.push(createdBy);
            }

            if (uniqueParticipants.length < 3) {
                return res.status(400).json({
                    success:false,
                    message:"Minimum 3 unique participants required"
                });
            }

            const users = await User.find({_id: {$in:uniqueParticipants}});

            if (users.length !== uniqueParticipants.length) {
                return res.status(400).json({
                    success: false,
                    message:"Some users not found"
                });
            }

            let groupPhoto = "";

            if (req.file) {
                const fileKey = `groups/${Date.now()}-${req.file.originalname}`;
            
                await s3.send(
                    new PutObjectCommand({
                        Bucket:process.env.AWS_S3_BUCKET_NAME,
                        Key: fileKey,
                        Body:req.file.buffer,
                        ContentType:req.file.mimetype
                    })
                );
                
                groupPhoto = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
            }

            const group = await Group.create({
                groupName,
                description,
                groupPhoto,
                participants: uniqueParticipants.map ((id) => ({
                    user: id,
                    role: id.toString() === createdBy.toString()? "superadmin" : "member"
                })),
                createdBy
            });

            const populatedGroup = await Group.findById(group._id)
            .populate(
                "participants.user",
                "name phone profilePic"
            )
            
            .populate(
                "createdBy",
                "name profilePic"
            );

            res.status(201).json({
                success: true,
                message: "Group created successfully", 
                data: populatedGroup
            });

        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    });
};

// SEARCH GROUPS
export const searchGroups = async (req, res) => {
    try {
        const { keyword } = req.query;

        if (!keyword?.trim()) {
            return res.status(400).json({
                success:false,
                message:"Keyword required"
            });
        }

        const groups = await Group.find({
            groupName: {
                $regex: keyword,
                $options: "i"
            }
        })
        .populate(
            "participants.user",
            "name profilePic"
        );
        
        res.status(200).json({
            success: true,
            data: groups
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ASSIGN MODERATOR
export const assignModerator = async (req, res) => {
    try {
        const {groupId, userId} = req.body;
        const currentUserId = req.user.id;
        const group = await Group.findById(groupId);

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success:false,
                message:"Invalid user id"
            });
        }

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        // Find the current user's group role
        const currentUser = group.participants.find(
            p =>
                p.user.toString() === currentUserId.toString()
        );

        if (!currentUser) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this group"
            });
        }

        // Check Assign Roles permission
        let hasPermission = false;

        if (["superadmin", "admin"].includes(currentUser.role)) {
            hasPermission = true;
        } else if (currentUser.role === "moderator") {
            hasPermission =
                group.settings?.rolePermissions?.moderator?.assignRoles === true;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to assign moderator roles"
            });
        }

        // Find target participant
        const targetParticipant = group.participants.find((p) =>
            p.user.toString() === userId.toString()
        );

        if (!targetParticipant) {
            return res.status(404).json({
                success: false,
                message: "User is not a participant of this group"
            });
        }

        if (["superadmin", "admin"].includes(targetParticipant.role)) {
            return res.status(400).json({
                success: false,
                message: "Cannot change this user's role"
            });
        }

        if (targetParticipant.role === "moderator") {
            return res.status(400).json({
                success: false,
                message: "User is already a moderator"
            });
        }

        targetParticipant.role = "moderator";

        const targetUser = await User.findById(userId).select("name");

        const systemMessage = await Message.create({
            groupId: group._id,
            sender: currentUserId,
            content: `${targetUser.name} was promoted to Moderator`,
            messageType: "system",
            tempId: crypto.randomUUID()
        });

        group.lastMessage = systemMessage._id;

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_role_updated",
            {
                groupId: group._id,
                userId,
                role: "moderator"
            }
        );

        io.to(group._id.toString()).emit(
            "receiveGroupMessage",
            systemMessage,
        );

        res.status(200).json({
            success: true,
            message: "Moderator assigned successfully",
            data: group
        });
    } 
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// REMOVE MODERATOR
export const removeModerator = async (req, res) => {
    try {
        const {groupId, userId} = req.body;
        const currentUserId = req.user.id;
        
        // Find Group
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message:"Group not found"
            });
        }

        // Find Current User
        const currentUser = group.participants.find((p) =>
            p.user.toString() === currentUserId.toString()
        );

        // Only Admin or superadmin Allowed
        if (
            !currentUser ||
            !["superadmin","admin"].includes(currentUser.role)
        ) {
            return res.status(403).json({
                success: false,
                message: "Only superadmin and admin can remove moderator"
            });
        }

        // Find Moderator
        const moderator = group.participants.find((p) =>
            p.user.toString() === userId.toString() && p.role === "moderator"
        );

        if (!moderator) {
            return res.status(404).json({
                success: false,
                message: "Moderator not found"
            });
        }

        moderator.role = "member";

        const targetUser = await User.findById(userId).select("name");

        const systemMessage = await Message.create({
            groupId: group._id,
            sender: currentUserId,
            content: `${targetUser.name} was removed as Moderator`,
            messageType: "system",
            tempId: crypto.randomUUID()
        });

        group.lastMessage = systemMessage._id;

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_role_updated",
            {
                groupId: group._id,
                userId,
                role: "member"
            }
        );

        io.to(group._id.toString()).emit(
            "receiveGroupMessage",
            systemMessage
        );

        // Response
        res.status(200).json({
            success: true,
            message: "Moderator removed successfully",
            data: group
        });
    } 
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ADD PARTICIPANTS
export const addParticipants = async (req, res) => {
    try {
        const {groupId, participants} = req.body;
        const currentUserId = req.user.id;

        // CHECK GROUP
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        // FIND CURRENT USER
        const currentUser = group.participants.find((p) =>
            p.user.toString() === currentUserId.toString()
        );

        if (!currentUser) {
            return res.status(403).json({
                success: false,
                message: "You are not a group participant"
            });
        }

        // PERMISSION CHECK
        let hasPermission = false;

        if (
            currentUser.role === "superadmin" ||
            currentUser.role === "admin"
        ) {
            hasPermission = true;
        }
        else if (currentUser.role === "moderator") {
            hasPermission =
                group.settings?.rolePermissions?.moderator?.addMembers === true;
        }
        else if (currentUser.role === "member") {
            hasPermission =
                group.settings?.rolePermissions?.member?.addMembers === true;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to add members"
            });
        }

        // VALIDATE PARTICIPANTS
        if (
            !participants ||
            !Array.isArray (participants) ||
            participants.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Participants required"
            });
        }

        // CHECK USERS EXIST
        const users = await User.find({
            _id: {$in: participants}
        }).select("name");

        if (users.length !== participants.length) {
            return res.status(400).json({
                success: false,
                message: "Some users not found"
            });
        }

        // EXISTING USERS
        const existingUsers = group.participants.map((p) =>
            p.user.toString()
        );

        // ADD PARTICIPANTS
        const addedUsers = [];

        participants.forEach(id => {
            const alreadyExists = existingUsers.includes(id.toString());

            if (!alreadyExists) {
                addedUsers.push(id.toString());

                group.participants.push({
                    user:id,
                    role:"member"
                });
            }
        });

        // NOTHING NEW TO ADD
        if (addedUsers.length === 0) {
            return res.status(400).json({
                success: false,
                message: "All selected users are already members"
            });
        }

        // SAVE GROUP
        await group.save();

        // GET CURRENT USER NAME
        const currentUserDoc = await User.findById(currentUserId)
            .select("name");

        if (!currentUserDoc) {
            return res.status(404).json({
                success: false,
                message: "Current user not found"
            });
        }

        const io = getIO();

        // GET NAMES OF ADDED USERS
        const addedUserNames = users
            .filter((user) =>
                addedUsers.includes(user._id.toString())
            )
            .map((user) => user.name);

        // SEND GROUP PARTICIPANT UPDATE
        io.to(group._id.toString()).emit(
            "group_participant_added",
            {
                groupId: group._id.toString(),
                participants: addedUserNames,
                participantIds: addedUsers,
                actorName: currentUserDoc.name,
                createdAt: new Date().toISOString()
            }
        );

        // SEND NOTIFICATION TO EACH NEW MEMBER
        for (const addedUserId of addedUsers) {
            await createGroupAddedNotification({
                receiver: addedUserId,
                sender: currentUserId,
                groupId: group._id,
                groupName: group.groupName
            });
        }

        // SUCCESS RESPONSE
        res.status(200).json({
            success: true,
            message: "Participants added successfully",
            data: group
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// REMOVE PARTICIPANT
export const removeParticipant = async (req, res) => {
    try {
        const {groupId, participantId} = req.body;
        const currentUserId = req.user.id;

        // CHECK GROUP
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        // FIND CURRENT USER
        const currentUser = group.participants.find((p) =>
            p.user.toString() === currentUserId.toString()
        );

        // PERMISSION CHECK
        if (!currentUser ||
            (
                !["superadmin","admin"].includes(currentUser.role)
            )
        ) {
            return res.status(403).json({
                success: false,
                message: "No permission"
            });
        }

        // FIND PARTICIPANT
        const participant = group.participants.find((p) =>
            p.user.toString() === participantId.toString()
        );

        // PARTICIPANT NOT FOUND
        if (!participant) {
            return res.status(404).json({
                success: false,
                message: "Participant not found"
            });
        }

        // ADMIN PROTECTION
        if (
            participant.role === "admin" ||
            participant.role === "superadmin"
        ) {
            return res.status(400).json({
                success:false,
                message:"Cannot remove superadmin and admin"
            });
        }

        // GET REMOVED USER NAME
        const removedUser = await User.findById(participantId)
            .select("name");

        if (!removedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        // GET CURRENT USER NAME
        const currentUserDoc = await User.findById(currentUserId)
            .select("name");

        if (!currentUserDoc) {
            return res.status(404).json({
                success: false,
                message: "Current user not found"
            });
        }

        // REMOVE PARTICIPANT
        group.participants = group.participants.filter((p) =>
            p.user.toString() !== participantId.toString()
        );

        // SAVE GROUP
        await group.save();

        const io = getIO();

        const removeNotificationPayload = {
            groupId: group._id.toString(),
            participants: [
                removedUser.name
            ],
            participantIds: [
                participantId.toString()
            ],
            actorName: currentUserDoc.name,
            createdAt: new Date().toISOString()
        };

        // GET REMOVED USER SOCKET FIRST
        const removedUserSocketId = await redisClient.get(
            `online:${participantId}`
        );

        const removedUserSocket = removedUserSocketId
            ? io.sockets.sockets.get(removedUserSocketId)
            : null;

        // SEND REMOVAL EVENT TO REMAINING GROUP MEMBERS
        io.to(group._id.toString()).emit(
            "group_participant_removed",
            removeNotificationPayload
        );

        // SEND REMOVAL EVENT DIRECTLY TO REMOVED USER
        if (removedUserSocket) {
            removedUserSocket.emit(
                "group_participant_removed",
                removeNotificationPayload
            );
        }

        // REMOVE USER FROM GROUP SOCKET ROOM
        if (removedUserSocket) {
            removedUserSocket.leave(group._id.toString());
        }

        await createGroupRemovedNotification({
            receiver: participantId,
            sender: currentUserId,
            groupId: group._id,
            groupName: group.groupName
        });

        // SUCCESS RESPONSE
        res.status(200).json({
            success: true,
            message: "Participant removed successfully",
            data: group
        });
    } 
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get my groups
export const getMyGroups = async (req, res) => {
    try {
        const userId = req.user.id;
        const groups = await Group.find({
            participants: {
                $elemMatch: {
                    user: userId,
                    archived: false
                }
            }
        }).populate(
            "participants.user",
            "name profilePic"
        ).sort({ updatedAt: -1 });
        
        res.status(200).json({
            success: true,
            data: groups
        });
    } 
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Leave group
export const leaveGroup = async (req, res) => {
    try {
        const { groupId } = req.body;
        const userId = req.user.id;
        const group = await Group.findById(groupId);
        
        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        const isMember = group.participants.some(
            p => p.user.toString() === userId.toString()
        );

        if (!isMember) {
            return res.status(400).json({
                success:false,
                message:"You are not a member"
            });
        }

        const participant = group.participants.find(
            p => p.user.toString() === userId.toString()
        );

        if (participant.role === "superadmin") {
            return res.status(400).json({
                success:false,
                message:"Super admin cannot leave group"
            });
        }

        group.participants = group.participants.filter(p =>
            p.user.toString() !== userId.toString()
        );

        await group.save();

        res.status(200).json({
            success:true,
            message:"Left group successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Delete group
export const deleteGroup = async (req,res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        const group = await Group.findById(groupId);
        
        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        const participant = group.participants.find(
            p =>
                p.user.toString() === userId.toString() &&
                p.role === "superadmin"
        );

        if (!participant) {
            return res.status(403).json({
                success:false,
                message:"Only super admin can delete group"
            });
        }

        await Message.deleteMany({groupId});
        await Group.findByIdAndDelete(groupId);

        res.status(200).json({
            success:true,
            message:"Group deleted successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Update group info
export const updateGroupInfo = async (req,res) => {
    try {
        const {groupId, groupName, description} = req.body;
        const userId = req.user.id;
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        // Find current participant
        const participant = group.participants.find(p =>
            p.user.toString() === userId.toString()
        );

        if (!participant) {
            return res.status(403).json({
                success:false,
                message:"You are not a member of this group"
            });
        }

        // Check Edit Group Info permission
        let hasPermission = false;

        if (["superadmin", "admin"].includes(participant.role)) {
            hasPermission = true;
        } else if (participant.role === "moderator") {
            hasPermission =
                group.settings?.rolePermissions?.moderator?.editGroupInfo === true;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to update group information"
            });
        }

        if (groupName && groupName.trim().length > 50) {
            return res.status(400).json({
                success: false,
                message: "Group name cannot exceed 50 characters"
            });
        }

        if (groupName) {
            group.groupName = groupName;
        }

        if (description) {
            group.description = description;
        }

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_updated",
            group
        );

        res.status(200).json({
            success:true,
            data:group
        });
    }
    catch (error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Change group photo
export const changeGroupPhoto = async (req,res) => {
    mediaUpload(req, res, async (err) => {

        if (err) {
            return res.status(400).json({
                success:false,
                message:err.message
            });
        }

        try {
            const { groupId } = req.body;
            const userId = req.user.id;
            const group = await Group.findById(groupId);

            if (!group) {
                return res.status(404).json({
                    success:false,
                    message:"Group not found"
                });
            }

            // Find current participant
            const participant = group.participants.find(p =>
                p.user.toString() === userId.toString()
            );

            if (!participant) {
                return res.status(403).json({
                    success:false,
                    message:"You are not a member of this group"
                });
            }

            // Check Edit Group Info permission
            let hasPermission = false;

            if (["superadmin", "admin"].includes(participant.role)) {
                hasPermission = true;
            } else if (participant.role === "moderator") {
                hasPermission =
                    group.settings?.rolePermissions?.moderator?.editGroupInfo === true;
            }

            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    message: "You don't have permission to change group photo"
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success:false,
                    message:"Photo required"
                });
            }

            if (group.groupPhoto) {
                await deleteMediaFromS3(group.groupPhoto);
            }

            const fileKey = `groups/${Date.now()}-${req.file.originalname}`;

            await s3.send(
                new PutObjectCommand({
                    Bucket:process.env.AWS_S3_BUCKET_NAME,
                    Key:fileKey,
                    Body:req.file.buffer,
                    ContentType:req.file.mimetype
                })
            );

            group.groupPhoto = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

            await group.save();

            const io = getIO();

            io.to(group._id.toString()).emit(
                "group_photo_updated",
                {
                    groupId: group._id,
                    groupPhoto: group.groupPhoto
                }
            );

            res.status(200).json({
                success:true,
                message:"Photo updated",
                data:group
            });
        }
        catch (error) {
            res.status(500).json({
                success:false,
                message:error.message
            });
        }
    });
};

// Send group message
export const sendGroupMessage = async (req, res) => {
    try {
        const { groupId, content } = req.body;
        const senderId = req.user.id;
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        const isMember = group.participants.some(p =>
            p.user.toString() === senderId.toString()
        );

        if (!isMember) {
            return res.status(403).json({
                success:false,
                message:"Not a group member"
            });
        }

        if (group.settings.onlyAdminsCanMessage) {
            const participant = group.participants.find(
                p =>
                    p.user.toString() === senderId.toString()
            );

            if (
                !participant || 
                !["superadmin","admin"].includes(participant.role)
            ) {
                return res.status(403).json({
                    success:false,
                    message:"Only superadmin and admin can send messages"
                });
            }
        }

        const participant = group.participants.find(
            p =>
                p.user.toString() === senderId.toString()
        );

        if (participant?.isMuted) {
            return res.status(403).json({
                success:false,
                message:"You are muted in this group"
            });
        }

        if (!content?.trim()) {
            return res.status(400).json({
                success:false,
                message:"Message content required"
            });
        }

        const message = await Message.create({
            groupId,
            sender: senderId,
            content,
            messageType:"text"
        });

        group.lastMessage = message._id;

        await group.save();

        const io = getIO();
        
        io.to(groupId.toString()).emit(
            "receiveGroupMessage",
            message
        );

        res.status(201).json({
            success:true,
            data:message
        });
    }
    catch (error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Get group messages
export const getGroupMessages = async (req,res) => {
    try {
        const { groupId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const userId = req.user.id;

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not founbd"
            });
        }

        const isMember = group.participants.some(
            p => p.user.toString() === userId.toString()
        );

        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: "Not a group member"
            });
        }

        const messages = await Message.find({
            groupId,
            isDeleted: false,
            deletedFor: { $ne: userId }
        }).populate(
            "sender",
            "name profilePic"
        ).populate(
            "replyTo",
            "content mediaUrl messageType"
        ).sort({ createdAt:-1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));

        const totalMessages = await Message.countDocuments({
            groupId,
            isDeleted: false,
            deletedFor: { $ne: userId }
        });

        res.status(200).json({
            success:true,
            totalMessages,
            currentPage:Number(page),
            totalPages:Math.ceil(totalMessages / limit),
            data:messages
        });
    }
    catch(error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Send group file
export const sendGroupFile = async (req,res) => {
    fileUpload(req,res,async(err)=>{
        if(err){
            return res.status(400).json({
                success:false,
                message:err.message
            });
        }
       
        try{
            const { groupId, caption } = req.body;
            const senderId = req.user.id;
            const group = await Group.findById(groupId);

            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: "Group not found"
                });
            }

            const isMember = group.participants.some(
                p => p.user.toString() === senderId.toString()
            );

            if (!isMember) {
                return res.status(403).json({
                    success: false,
                    message: "Not a group member"
                });
            }

            const participant = group.participants.find(
                p =>
                    p.user.toString() === senderId.toString()
            );

            if (
                group.settings.onlyAdminsCanShareMedia &&
                !["superadmin","admin"].includes(participant.role)
            ) {
                return res.status(403).json({
                    success:false,
                    message:"Only admins can share media"
                });
            }

            if (participant?.isMuted) {
                return res.status(403).json({
                    success:false,
                    message:"You are muted in this group"
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Media required"
                });
            }

            if (req.file.size > MAX_FILE_SIZE) {
                return res.status(400).json({
                    message: `File size cannot exceed ${process.env.MAX_FILE_SIZE_MB} MB`
                });
            }

            const fileKey = `group-files/${Date.now()}-${req.file.originalname}`;

            await s3.send(
                new PutObjectCommand({
                    Bucket:process.env.AWS_S3_BUCKET_NAME,
                    Key:fileKey,
                    Body:req.file.buffer,
                    ContentType:req.file.mimetype
                })
            );

            const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

            const message = await Message.create({
                groupId,
                sender:senderId,
                messageType:"file",
                mediaUrl:fileUrl,
                caption: caption || "",
                fileName:req.file.originalname,
                fileSize:req.file.size
            });

            await Group.findByIdAndUpdate(
                groupId,
                {
                    lastMessage:message._id
                }
            );

            const io = getIO();

            io.to(groupId.toString()).emit(
                "receiveGroupMessage",
                message
            );

            res.status(201).json({
                success:true,
                data:message
            });
        }
        catch(error){
            res.status(500).json({
                success:false,
                message:error.message
            });
        }
    });
};

// Send group media
export const sendGroupMedia = async (req, res) => {
    mediaUpload(req, res, async (err) => {
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }

        try {
            const { groupId, caption } = req.body;
            const senderId = req.user.id;
            const group = await Group.findById(groupId);

            if (!group) {
                return res.status(404).json({
                    success: false,
                    message: "Group not found"
                });
            }

            const isMember = group.participants.some(
                p =>
                    p.user.toString() === senderId.toString()
            );

            if (!isMember) {
                return res.status(403).json({
                    success: false,
                    message: "Not a group member"
                });
            }

            const participant = group.participants.find(
                p =>
                    p.user.toString() === senderId.toString()
            );

            if (
                group.settings.onlyAdminsCanShareMedia &&
                !["superadmin","admin"].includes(participant.role)
            ) {
                return res.status(403).json({
                    success:false,
                    message:"Only admins can share media"
                });
            }

            if (participant?.isMuted) {
                return res.status(403).json({
                    success:false,
                    message:"You are muted in this group"
                });
            }

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "Media required"
                });
            }

            const uniqueId = crypto.randomUUID();
            
            let mediaUrl = "";
            let thumbnailUrl = "";
            let messageType = "file";
            let originalKey = "";

            // Image limit
            if (
                req.file.mimetype.startsWith("image/") &&
                req.file.size > MAX_IMAGE_SIZE
            ) {
                return res.status(400).json({
                    message: `Image size cannot exceed ${process.env.MAX_IMAGE_SIZE_MB} MB`
                });
            }

            // Audio limit
            if (
                req.file.mimetype.startsWith("audio/") &&
                req.file.size > MAX_AUDIO_SIZE
            ) {
                return res.status(400).json({
                    message: `Audio size cannot exceed ${process.env.MAX_AUDIO_SIZE_MB} MB`
                });
            }

            // Video limit
            if (
                req.file.mimetype.startsWith("video/") &&
                req.file.size > MAX_VIDEO_SIZE
            ) {
                return res.status(400).json({
                    message: `Video size cannot exceed ${process.env.MAX_VIDEO_SIZE_MB} MB`
                });
            }

            if (req.file.mimetype.startsWith("image/")) {
                messageType = "image";

                const compressedBuffer = await sharp(req.file.buffer)
                    .resize({
                        width: 1280,
                        withoutEnlargement: true
                    })
                    .jpeg({ quality: 75 })
                    .toBuffer();

                const imageKey = `group-media/${uniqueId}.jpg`;

                await s3.send(
                    new PutObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET_NAME,
                        Key: imageKey,
                        Body: compressedBuffer,
                        ContentType: "image/jpeg"
                    })
                );

                mediaUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${imageKey}`;

                const thumbBuffer = await sharp(req.file.buffer)
                    .resize({ width: 250 })
                    .jpeg({ quality: 50 })
                    .toBuffer();

                const thumbKey = `group-thumbs/${uniqueId}.jpg`;

                await s3.send(
                    new PutObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET_NAME,
                        Key: thumbKey,
                        Body: thumbBuffer,
                        ContentType: "image/jpeg"
                    })
                );

                thumbnailUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${thumbKey}`;
            }

            else if (req.file.mimetype.startsWith("video/")) {
                messageType = "video";
                originalKey = `group-original/${uniqueId}.mp4`;

                await s3.send(
                    new PutObjectCommand({
                        Bucket: process.env.AWS_S3_BUCKET_NAME,
                        Key: originalKey,
                        Body: req.file.buffer,
                        ContentType: req.file.mimetype
                    })
                );

                mediaUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${originalKey}`;
            }

            else if (req.file.mimetype.startsWith("audio/")) {
                messageType = "audio";

                const ext = path.extname(req.file.originalname);

                const tempInput = path.join(
                    os.tmpdir(),
                    `${uniqueId}-input${ext}`
                );

                const tempCompressed = path.join(
                    os.tmpdir(),
                    `${uniqueId}-compressed.mp3`
                );

                fs.writeFileSync(
                    tempInput,
                    req.file.buffer
                );

                await new Promise((resolve,reject)=>{
                    ffmpeg(tempInput)
                        .audioCodec("libmp3lame")
                        .audioBitrate("128k")
                        .format("mp3")
                        .on("end",resolve)
                        .on("error",reject)
                        .save(tempCompressed);
                });

                const compressedBuffer = fs.readFileSync(tempCompressed);
                const audioKey = `group-media/${uniqueId}.mp3`;

                await s3.send(
                    new PutObjectCommand({
                        Bucket:process.env.AWS_S3_BUCKET_NAME,
                        Key:audioKey,
                        Body:compressedBuffer,
                        ContentType:"audio/mpeg"
                    })
                );

                mediaUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${audioKey}`;

                fs.unlinkSync(tempInput);
                fs.unlinkSync(tempCompressed);
            }

            const message = await Message.create({
                groupId,
                sender: senderId,
                messageType,
                mediaType: messageType,
                mediaUrl,
                thumbnailUrl,
                caption: caption || "",
                fileName: req.file.originalname,
                fileSize: req.file.size,
                fileType: req.file.mimetype,
                mediaSize: req.file.size
            });

            group.lastMessage = message._id;

            await group.save();

            const io = getIO();

            io.to(groupId.toString()).emit(
                "receiveGroupMessage",
                message
            );

            if (messageType === "video") {
                setImmediate(() => {
                    compressVideoInBackground(
                        message._id,
                        uniqueId,
                        originalKey
                    ).catch(console.error);
                });
            }

            res.status(201).json({
                success: true,
                data: message
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                message: error.message
            });
        }
    });
};

// Update group settings
export const updateGroupSettings = async (req,res)=>{
    try{
        const {
            groupId,
            onlyAdminsCanMessage,
            onlyAdminsCanShareMedia
        } = req.body;
        const userId = req.user.id;
        
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        const admin = group.participants.find(
                p =>
                    p.user.toString() ===
                    userId.toString() &&
                    ["superadmin","admin"].includes(p.role)
        );

        if(!admin){
            return res.status(403).json({
                success:false,
                message:"Only superadmin or admin can update settings"
            });
        }

        if (typeof onlyAdminsCanMessage === "boolean") {
            group.settings.onlyAdminsCanMessage =
                onlyAdminsCanMessage;
        }

        if (typeof onlyAdminsCanShareMedia === "boolean") {
            group.settings.onlyAdminsCanShareMedia =
                onlyAdminsCanShareMedia;
        }

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_settings_updated",
            {
                groupId: group._id,
                settings: group.settings
            }
        );

        res.status(200).json({
            success:true,
            data:group
        });
    }
    catch(error){
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Remove group photo
export const removeGroupPhoto = async (req, res) => {
    try {
        const { groupId } = req.body;
        const userId = req.user.id;

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        // Find current participant
        const participant = group.participants.find(
            p => p.user.toString() === userId.toString()
        );

        if (!participant) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this group"
            });
        }

        // Check Edit Group Info permission
        let hasPermission = false;

        if (["superadmin", "admin"].includes(participant.role)) {
            hasPermission = true;
        } else if (participant.role === "moderator") {
            hasPermission =
                group.settings?.rolePermissions?.moderator?.editGroupInfo === true;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to remove group photo"
            });
        }

        if (!group.groupPhoto) {
            return res.status(400).json({
                success: false,
                message: "No group photo found"
            });
        }

        await deleteMediaFromS3(group.groupPhoto);

        group.groupPhoto = "";

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_photo_updated",
            {
                groupId: group._id,
                groupPhoto: ""
            }
        );

        res.status(200).json({
            success: true,
            message: "Group photo removed successfully",
            data: group
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// GET GROUP DETAILS
export const getGroupDetails = async (req, res) => {
    try {
        const { groupId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(groupId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid group id"
            });
        }

        const group = await Group.findById(groupId)
        .populate(
            "participants.user",
            "name phone profilePic"
        )

        .populate(
            "createdBy",
            "name profilePic"
        );
        
        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }
        
        res.status(200).json({
            success: true,
            data: group
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Pin message
export const pinMessage = async (req, res) => {
    try {
        const { messageId, groupId } = req.body;
        const userId = req.user._id || req.user.id;

        const [message, group] = await Promise.all([
            Message.findById(messageId),
            Group.findById(groupId)
        ]);

        if (!message || !group) {
            return res.status(404).json({
                success: false,
                message: "Message or Group not found"
            });
        }

        // Find current participant
        const participant = group.participants.find(
            p => p.user.toString() === userId.toString()
        );

        if (!participant) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this group"
            });
        }

        // Check Pin Messages permission
        let hasPermission = false;

        if (["superadmin", "admin"].includes(participant.role)) {
            hasPermission = true;
        } else if (participant.role === "moderator") {
            hasPermission =
                group.settings?.rolePermissions?.moderator?.pinMessages === true;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to pin messages"
            });
        }

        if (message.isPinned) {
            return res.status(400).json({
                success: false,
                message: "Message already pinned"
            });
        }

        message.isPinned = true;
        message.pinnedBy = userId;
        message.pinnedAt = new Date();

        await message.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "message_pinned",
            {
                groupId: group._id,
                messageId: message._id,
                pinnedBy: userId,
                pinnedAt: message.pinnedAt
            }
        );

        res.status(200).json({
            success: true,
            message: "Message pinned successfully",
            data: message
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Unpin message
export const unpinMessage = async (req, res) => {
    try {
        const { messageId, groupId } = req.body;
        const userId = req.user._id || req.user.id;

        const [message, group] = await Promise.all([
            Message.findById(messageId),
            Group.findById(groupId)
        ]);

        if (!message || !group) {
            return res.status(404).json({
                success: false,
                message: "Message or Group not found"
            });
        }

        // Find current participant
        const participant = group.participants.find(
            p => p.user.toString() === userId.toString()
        );

        if (!participant) {
            return res.status(403).json({
                success: false,
                message: "You are not a member of this group"
            });
        }

        // Check Pin Messages permission
        let hasPermission = false;

        if (["superadmin", "admin"].includes(participant.role)) {
            hasPermission = true;
        } else if (participant.role === "moderator") {
            hasPermission =
                group.settings?.rolePermissions?.moderator?.pinMessages === true;
        }

        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                message: "You don't have permission to unpin messages"
            });
        }

        if (!message.isPinned) {
            return res.status(400).json({
                success: false,
                message: "Message is not pinned"
            });
        }

        message.isPinned = false;
        message.pinnedBy = null;
        message.pinnedAt = null;

        await message.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "message_unpinned",
            {
                groupId: group._id,
                messageId: message._id
            }
        );

        res.status(200).json({
            success: true,
            message: "Message unpinned successfully",
            data: message
        });
    } 
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get pinned messages
export const getPinnedMessages = async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Group.findById(groupId);

        const isMember = group.participants.some(
            p =>
                p.user.toString() === req.user.id.toString()
        );

        if (!isMember) {
            return res.status(403).json({
                success:false,
                message:"Not a group member"
            });
        }

        const messages = await Message.find({
            groupId,
            isPinned: true,
            isDeleted: false
        })
        .populate("sender", "name")
        .populate("pinnedBy", "name")
        .sort({ pinnedAt: -1 });

        res.status(200).json({
            success: true,
            count: messages.length,
            data: messages
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Update group rules
export const updateGroupRules = async (req, res) => {
    try {
        const { groupId, rules } = req.body;
        const userId = req.user.id;

        if (!Array.isArray(rules)) {
            return res.status(400).json({
                success: false,
                message: "Rules must be an array"
            });
        }

        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        const participant = group.participants.find(
            p =>
                p.user.toString() === userId.toString() &&
                ["superadmin", "admin", "moderator"].includes(p.role)
        );

        if (!participant) {
            return res.status(403).json({
                success: false,
                message: "Only superadmin, admin or moderator can update rules"
            });
        }

        group.rules = rules;

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_rules_updated",
            {
                groupId: group._id,
                rules: group.rules
            }
        );

        res.status(200).json({
            success: true,
            message: "Rules updated successfully",
            data: group.rules
        });

    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get group rules
export const getGroupRules = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        const isMember = group.participants.some(
            p => p.user.toString() === userId.toString()
        );

        if (!isMember) {
            return res.status(403).json({
                success: false,
                message: "Not a group member"
            });
        }

        res.status(200).json({
            success: true,
            count: group.rules.length,
            data: group.rules
        });

    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Assign admin
export const assignAdmin = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const currentUserId = req.user.id;
    
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        const currentUser = group.participants.find(
            p =>
                p.user.toString() === currentUserId.toString()
        );

        if (!currentUser || currentUser.role !== "superadmin") {
            return res.status(403).json({
                success:false,
                message:"Only superadmin can assign admin"
            });
        }

        const participant = group.participants.find(
            p =>
                p.user.toString() === userId.toString()
        );

        if (!participant) {
            return res.status(404).json({
                success:false,
                message:"Member not found"
            });
        }

        if (participant.role === "superadmin") {
            return res.status(400).json({
                success:false,
                message:"Cannot modify superadmin role"
            });
        }

        if (participant.role === "admin") {
            return res.status(400).json({
                success: false,
                message: "User is already an admin"
            });
        }

        participant.role = "admin";

        const targetUser = await User.findById(userId).select("name");

        const systemMessage = await Message.create({
            groupId: group._id,
            sender: currentUserId,
            content: `${targetUser.name} was promoted to Admin`,
            messageType: "system",
            tempId: crypto.randomUUID()
        });

        group.lastMessage = systemMessage._id;

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_role_updated",
            {
                groupId: group._id,
                userId,
                role: "admin"
            }
        );

        io.to(group._id.toString()).emit(
            "receiveGroupMessage",
            systemMessage
        );

        res.status(200).json({
            success:true,
            message:"Admin assigned successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Remove admin
export const removeAdmin = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const currentUserId = req.user.id;
    
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        const currentUser = group.participants.find(
            p =>
                p.user.toString() === currentUserId.toString()
        );

        if (!currentUser || currentUser.role !== "superadmin") {
            return res.status(403).json({
                success:false,
                message:"Only superadmin can remove admin"
            });
        }

        const participant = group.participants.find(
            p =>
                p.user.toString() === userId.toString()
        );

        if (!participant) {
            return res.status(404).json({
                success:false,
                message:"Member not found"
            });
        }

        participant.role = "member";

        const targetUser = await User.findById(userId).select("name");

        const systemMessage = await Message.create({
            groupId: group._id,
            sender: currentUserId,
            content: `${targetUser.name} was removed as Admin`,
            messageType: "system",
            tempId: crypto.randomUUID()
        });

        group.lastMessage = systemMessage._id;

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_role_updated",
            {
                groupId: group._id,
                userId,
                role: "member"
            }
        );

        io.to(group._id.toString()).emit(
            "receiveGroupMessage",
            systemMessage
        );

        res.status(200).json({
            success:true,
            message:"Admin removed successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Mute member
export const muteMember = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const currentUserId = req.user.id;
    
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        const currentUser = group.participants.find(
            p =>
                p.user.toString() === currentUserId.toString()
        );

        if (
            !currentUser ||
            !["superadmin", "admin"].includes(currentUser.role)
        ) {
            return res.status(403).json({
                success:false,
                message:"Only superadmin or admin can mute member"
            });
        }

        const participant = group.participants.find(
            p =>
                p.user.toString() === userId.toString()
        );

        if (!participant) {
            return res.status(404).json({
                success:false,
                message:"Member not found"
            });
        }

        participant.isMuted = true;

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_member_muted",
            {
                groupId: group._id,
                userId,
                isMuted: true
            }
        );

        res.status(200).json({
            success:true,
            message:"Member muted successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Unmute member
export const unmuteMember = async (req, res) => {
    try {
        const { groupId, userId } = req.body;
        const currentUserId = req.user.id;
    
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success:false,
                message:"Group not found"
            });
        }

        const currentUser = group.participants.find(
            p =>
                p.user.toString() === currentUserId.toString()
        );

        if (
            !currentUser ||
            !["superadmin", "admin"].includes(currentUser.role)
        ) {
            return res.status(403).json({
                success:false,
                message:"Only superadmin or admin can unmute member"
            });
        }

        const participant = group.participants.find(
            p =>
                p.user.toString() === userId.toString()
        );

        if (!participant) {
            return res.status(404).json({
                success:false,
                message:"Member not found"
            });
        }

        participant.isMuted = false;

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_member_muted",
            {
                groupId: group._id,
                userId,
                isMuted: false
            }
        );

        res.status(200).json({
            success:true,
            message:"Member unmuted successfully"
        });
    }
    catch (error) {
        res.status(500).json({
            success:false,
            message:error.message
        });
    }
};

// Generate group invite link
export const generateInviteLink = async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        // Only admin/superadmin can generate link
        const participant = group.participants.find(
            p => p.user.toString() === req.user.id
        );

        if (
            !participant ||
            !["superadmin", "admin"].includes(participant.role)
        ) {
            return res.status(403).json({
                success: false,
                message: "Only admins can generate invite links"
            });
        }

        // Generate only once
        if (!group.inviteToken) {
            group.inviteToken = crypto.randomBytes(32).toString("hex");
        }

        group.inviteLinkEnabled = true;

        // Optional: 7 days expiry
        group.inviteExpiresAt = new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
        );

        await group.save();

        const inviteLink =`${process.env.APP_URL}/groups/invite/${group.inviteToken}`;

        return res.status(200).json({
            success: true,
            message: "Invite link generated successfully",
            inviteLink
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get group invite details
export const getInviteDetails = async (req, res) => {
    try {
        const { token } = req.params;

        const group = await Group.findOne({
            inviteToken: token
        })
        .select("groupName description groupPhoto participants inviteLinkEnabled inviteExpiresAt");

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Invalid invite link"
            });
        }

        if (!group.inviteLinkEnabled) {
            return res.status(400).json({
                success: false,
                message: "Invite link is disabled"
            });
        }

        if (
            group.inviteExpiresAt &&
            group.inviteExpiresAt < new Date()
        ) {
            return res.status(400).json({
                success: false,
                message: "Invite link has expired"
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                groupId: group._id,
                groupName: group.groupName,
                description: group.description,
                groupPhoto: group.groupPhoto,
                membersCount: group.participants.length
            }
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Join group using invite link
export const joinGroupByInvite = async (req, res) => {
    try {
        const { token } = req.params;

        const group = await Group.findOne({
            inviteToken: token
        });

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Invalid invite link"
            });
        }

        if (!group.inviteLinkEnabled) {
            return res.status(400).json({
                success: false,
                message: "Invite link is disabled"
            });
        }

        if (
            group.inviteExpiresAt &&
            group.inviteExpiresAt < new Date()
        ) {
            return res.status(400).json({
                success: false,
                message: "Invite link has expired"
            });
        }

        const alreadyMember = group.participants.some(
            participant =>
                participant.user.toString() === req.user.id
        );

        if (alreadyMember) {
            return res.status(400).json({
                success: false,
                message: "You are already a member of this group"
            });
        }

        group.participants.push({
            user: req.user.id,
            role: "member"
        });

        const joinedUser = await User.findById(req.user.id).select("name");

        const systemMessage = await Message.create({
            groupId: group._id,
            sender: req.user.id,
            content: `${joinedUser.name} joined via invite link`,
            messageType: "text",
            tempId: crypto.randomUUID()
        });

        group.lastMessage = systemMessage._id;

        await group.save();

        const io = getIO();

        io.to(group._id.toString()).emit(
            "group_participant_added",
            {
                groupId: group._id,
                participants: [req.user.id]
            }
        );

        io.to(group._id.toString()).emit(
            "receiveGroupMessage",
            systemMessage
        );

        const socketId = await redisClient.get(`online:${req.user.id}`);

        if (socketId) {
            const socket = io.sockets.sockets.get(socketId);

            if (socket) {
                socket.join(group._id.toString());

                console.log(`User ${req.user.id} joined socket room ${group._id}`);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Joined group successfully",
            groupId: group._id
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Revoke Group Invite Link
export const revokeInviteLink = async (req, res) => {
    try {
        const { groupId } = req.params;
        const group = await Group.findById(groupId);

        if (!group) {
            return res.status(404).json({
                success: false,
                message: "Group not found"
            });
        }

        // Only admin/superadmin can revoke
        const participant = group.participants.find(
            p => p.user.toString() === req.user.id
        );

        if (
            !participant ||
            !["superadmin", "admin"].includes(participant.role)
        ) {
            return res.status(403).json({
                success: false,
                message: "Only admins can revoke invite links"
            });
        }

        group.inviteToken = null;
        group.inviteLinkEnabled = false;
        group.inviteExpiresAt = null;

        await group.save();

        return res.status(200).json({
            success: true,
            message: "Invite link revoked successfully"
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Pin group
export const pinGroup = async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.user.id;

    const group = await Group.findOneAndUpdate(
      {
        _id: groupId,
        "participants.user": userId
      },
      {
        $set: {
          "participants.$.pinned": true
        }
      },
      { new: true }
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Group pinned"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// Unpin group
export const unpinGroup = async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.user.id;

    const group = await Group.findOneAndUpdate(
      {
        _id: groupId,
        "participants.user": userId
      },
      {
        $set: {
          "participants.$.pinned": false
        }
      },
      { new: true }
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Group unpinned"
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Clear group chat
export const clearGroupChat = async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.user.id;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required"
      });
    }

    const group = await Group.findOne({
      _id: groupId,
      "participants.user": userId
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or access denied"
      });
    }

    const result = await Message.updateMany(
      {
        groupId,
        deletedFor: { $ne: userId }
      },
      {
        $addToSet: {
          deletedFor: userId
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: "Group chat cleared successfully",
      clearedMessages: result.modifiedCount
    });
  }
  catch (err) {
    console.error("Clear group chat error:", err);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// Delete group chat for me
export const deleteGroupChatForMe = async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.user.id;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required"
      });
    }

    const group = await Group.findOne({
      _id: groupId,
      participants: {
        $elemMatch: {
          user: userId
        }
      }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found or you are not a member"
      });
    }

    // Hide group from this user's chat list
    await Group.updateOne(
      {
        _id: groupId,
        "participants.user": userId
      },
      {
        $set: {
          "participants.$.archived": true
        }
      }
    );

    // Hide existing messages from this user
    await Message.updateMany(
      {
        groupId: groupId,
        isDeleted: false
      },
      {
        $addToSet: {
          deletedFor: userId
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: "Group chat deleted for you"
    });
  }
  catch (error) {
    console.error("Delete group chat for me error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete group chat"
    });
  }
};

// Request to join group
export const requestToJoinGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid group ID"
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    const alreadyMember = group.participants.some(
      participant => participant.user.toString() === userId
    );

    if (alreadyMember) {
      return res.status(400).json({
        success: false,
        message: "You are already a group member"
      });
    }

    const existingRequest = await JoinRequest.findOne({
      group: groupId,
      user: userId,
      status: "pending"
    });

    if (existingRequest) {
      return res.status(409).json({
        success: false,
        message: "You already have a pending join request"
      });
    }

    const joinRequest = await JoinRequest.create({
      group: groupId,
      user: userId
    });

    return res.status(201).json({
      success: true,
      message: "Join request submitted successfully",
      data: joinRequest
    });
  }
  catch (error) {
    if (error.code === 11000) {
        return res.status(409).json({
            success: false,
            message: "You already have a pending join request"
        });
    }

    console.error("Request to join group error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Get group join requests
export const getGroupJoinRequests = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid group ID"
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    const participant = group.participants.find(
      item => item.user.toString() === userId
    );

    if (!participant) {
      return res.status(403).json({
        success: false,
        message: "You are not a group member"
      });
    }

    const isSuperAdmin = participant.role === "superadmin";

    const canApprove =
      participant.role === "admin" &&
      group.settings?.rolePermissions?.admin?.approveJoinRequests === true;

    if (!isSuperAdmin && !canApprove) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view join requests"
      });
    }

    const requests = await JoinRequest.find({
      group: groupId,
      status: "pending"
    })
      .populate("user", "name profilePic")
      .sort({ requestedAt: -1 });

    return res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  }
  catch (error) {
    console.error("Get group join requests error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Review group join request
export const reviewGroupJoinRequest = async (req, res) => {
  let session;

  try {
    const { groupId, requestId } = req.params;
    const { action } = req.body;
    const userId = req.user.id;

    if (
      !mongoose.Types.ObjectId.isValid(groupId) ||
      !mongoose.Types.ObjectId.isValid(requestId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid group ID or request ID"
      });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "Action must be approve or reject"
      });
    }

    session = await mongoose.startSession();

    let reviewedRequest;
    let approvalEvent = null;

    await session.withTransaction(async () => {
      const group = await Group.findById(groupId).session(session);

      if (!group) {
        throw new Error("GROUP_NOT_FOUND");
      }

      const participant = group.participants.find(
        item => item.user.toString() === userId.toString()
      );

      if (!participant) {
        throw new Error("NOT_GROUP_MEMBER");
      }

      const isSuperAdmin = participant.role === "superadmin";

      const canApprove =
        participant.role === "admin" &&
        group.settings?.rolePermissions?.admin?.approveJoinRequests === true;

      if (!isSuperAdmin && !canApprove) {
        throw new Error("PERMISSION_DENIED");
      }

      const joinRequest = await JoinRequest.findOne({
        _id: requestId,
        group: groupId,
        status: "pending"
      }).session(session);

      if (!joinRequest) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (action === "approve") {
        const alreadyMember = group.participants.some(
          item =>
            item.user.toString() === joinRequest.user.toString()
        );

        if (!alreadyMember) {
          const [joinedUser, approver] = await Promise.all([
            User.findById(joinRequest.user)
              .select("name")
              .session(session),

            User.findById(userId)
              .select("name")
              .session(session)
          ]);

          group.participants.push({
            user: joinRequest.user,
            role: "member"
          });

          const [systemMessage] = await Message.create(
            [{
              groupId: group._id,
              sender: approver._id,
              content: `${approver.name} added ${joinedUser.name}.`,
              messageType: "text",
              status: "sent",
              tempId: `group-membership-added-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2, 8)}`
            }],
            { session }
          );

          group.lastMessage = systemMessage._id;

          await group.save({ session });

          approvalEvent = {
            groupId: group._id.toString(),
            userId: joinRequest.user.toString(),
            userName: joinedUser?.name || "New member",
            actorName: approver?.name || "Admin",
            systemMessage
          };
        }
      }

      joinRequest.status = action === "approve" ? "approved" : "rejected";
      joinRequest.reviewedBy = userId;
      joinRequest.reviewedAt = new Date();

      await joinRequest.save({ session });

      reviewedRequest = joinRequest;
    });

    if (action === "approve" && approvalEvent) {
      try {
        const io = getIO();

        const socketId = await redisClient.get(
          `online:${approvalEvent.userId}`
        );

        if (socketId) {
          const socket = io.sockets.sockets.get(socketId);

          if (socket) {
            await socket.join(approvalEvent.groupId);
          }
        }

        io.to(approvalEvent.groupId).emit(
          "group_participant_added",
          {
            groupId: approvalEvent.groupId,
            participants: [approvalEvent.userName],
            participantIds: [approvalEvent.userId],
            actorName: approvalEvent.actorName,
            createdAt: new Date().toISOString()
          }
        );

        io.to(approvalEvent.groupId).emit(
          "receiveGroupMessage",
          approvalEvent.systemMessage
        );
      } catch (socketError) {
        console.error(
          "Join approval Socket.IO notification error:",
          socketError
        );
      }
    }

    return res.status(200).json({
      success: true,
      message:
        action === "approve"
          ? "Join request approved successfully"
          : "Join request rejected successfully",
      data: reviewedRequest
    });

  } catch (error) {
    const errors = {
      GROUP_NOT_FOUND: [
        404,
        "Group not found"
      ],
      NOT_GROUP_MEMBER: [
        403,
        "You are not a group member"
      ],
      PERMISSION_DENIED: [
        403,
        "You do not have permission to review join requests"
      ],
      REQUEST_NOT_FOUND: [
        404,
        "Pending join request not found"
      ]
    };

    if (errors[error.message]) {
      const [status, message] = errors[error.message];

      return res.status(status).json({
        success: false,
        message
      });
    }

    console.error("Review group join request error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

// Group permission management
const getEffectiveRolePermissions = (permissions = {}) => ({
  member: {
    addMembers: permissions.member?.addMembers === true
  },
  moderator: {
    addMembers: permissions.moderator?.addMembers === true,
    assignRoles: permissions.moderator?.assignRoles === true,
    pinMessages: permissions.moderator?.pinMessages === true,
    editGroupInfo: permissions.moderator?.editGroupInfo === true,
  },
  admin: {
    approveJoinRequests:
      permissions.admin?.approveJoinRequests === true
  }
});

// Get permissions
export const getGroupPermissions = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid group ID"
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    const isParticipant = group.participants.some(
      participant => participant.user.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "You are not a group member"
      });
    }

    const rolePermissions = getEffectiveRolePermissions(
      group.settings?.rolePermissions
    );

    return res.status(200).json({
      success: true,
      data: {
        groupId: group._id,
        rolePermissions
      }
    });
  }
  catch (error) {
    console.error("Get group permissions error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// Update permission
export const updateGroupPermissions = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { rolePermissions } = req.body;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid group ID"
      });
    }

    if (
      !rolePermissions ||
      typeof rolePermissions !== "object" ||
      Array.isArray(rolePermissions)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid rolePermissions object is required"
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    const participant = group.participants.find(
      item => item.user.toString() === userId
    );

    if (!participant || participant.role !== "superadmin") {
      return res.status(403).json({
        success: false,
        message: "Only the Super Admin can update group permissions"
      });
    }

    const allowedPermissions = {
      member: ["addMembers"],
      moderator: [
        "addMembers",
        "assignRoles",
        "pinMessages",
        "editGroupInfo"
      ],
      admin: ["approveJoinRequests"]
    };

    const roles = Object.keys(rolePermissions);

    if (roles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one permission must be provided"
      });
    }

    // Validate all requested changes before updating anything.
    for (const role of roles) {
      if (!Object.prototype.hasOwnProperty.call(
        allowedPermissions,
        role
      )) {
        return res.status(400).json({
          success: false,
          message: `Invalid role: ${role}`
        });
      }

      const permissions = rolePermissions[role];

      if (
        !permissions ||
        typeof permissions !== "object" ||
        Array.isArray(permissions)
      ) {
        return res.status(400).json({
          success: false,
          message: `Invalid permissions for role: ${role}`
        });
      }

      const permissionKeys = Object.keys(permissions);

      if (permissionKeys.length === 0) {
        return res.status(400).json({
          success: false,
          message: `No permissions provided for role: ${role}`
        });
      }

      for (const permission of permissionKeys) {
        if (!allowedPermissions[role].includes(permission)) {
          return res.status(400).json({
            success: false,
            message: `Invalid permission: ${role}.${permission}`
          });
        }

        if (typeof permissions[permission] !== "boolean") {
          return res.status(400).json({
            success: false,
            message: `${role}.${permission} must be a boolean`
          });
        }
      }
    }

    // Preserve existing values and initialize missing fields as false.
    const updatedPermissions = getEffectiveRolePermissions(
      group.settings?.rolePermissions
    );

    for (const role of roles) {
      for (const permission of Object.keys(rolePermissions[role])) {
        updatedPermissions[role][permission] =
          rolePermissions[role][permission];
      }
    }

    group.set("settings.rolePermissions", updatedPermissions);

    await group.save();

    return res.status(200).json({
      success: true,
      message: "Group permissions updated successfully",
      data: {
        groupId: group._id,
        rolePermissions: updatedPermissions
      }
    });
  }
  catch (error) {
    console.error("Update group permissions error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
