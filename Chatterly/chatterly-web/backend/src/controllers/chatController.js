import Chat from "../models/Chat.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import mongoose from "mongoose";
import admin from "../config/firebase.js";
import redisClient from "../config/redis.js";
import multer from "multer";
import s3 from "../config/s3.js";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import deleteMediaFromS3 from "../utils/s3Delete.js";
import Group from "../models/Group.js";
import { compressVideoInBackground } from "../jobs/mediaCompressionJob.js";
import ChatSetting from "../models/ChatSetting.js";

ffmpeg.setFfmpegPath(ffmpegPath);

// Size conversion
const MB = 1024 * 1024;

const MAX_IMAGE_SIZE = Number(process.env.MAX_IMAGE_SIZE_MB || 20) * MB;
const MAX_VIDEO_SIZE = Number(process.env.MAX_VIDEO_SIZE_MB || 500) * MB;
const MAX_AUDIO_SIZE = Number(process.env.MAX_AUDIO_SIZE_MB || 200) * MB;
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE_MB || 500) * MB;

// Media upload size
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
  }
}).single("media");

// Start chat
export const startChat = async (req, res) => {
  try {
    const { receiverId } = req.body;
    const senderId = req.user.id;

    // Validate receiverId
    if (!receiverId) {
      return res.status(400).json({ message: "Receiver ID is required" });
    }

    // Prevent self chat
    if (receiverId === senderId) {
      return res.status(400).json({ message: "Cannot start chat with yourself" });
    }

    // Check if receiver exists
    const receiverUser = await User.findById(receiverId);
    if (!receiverUser) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    const currentUser = await User.findById(senderId);

    const isBlocked = currentUser.blockedUsers.some(
      id =>
        id.toString() === receiverId
    ) ||
      receiverUser.blockedUsers.some(
        id =>
          id.toString() === senderId
      );

    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Cannot start chat with blocked user"
      });
    }

    // Find existing chat
    let chat = await Chat.findOne({
      "participants.user": { $all: [senderId, receiverId] },
    });

    let isNewChat = false;

    // Create new chat if not exists
    if (!chat) {
      chat = await Chat.create({
        participants: [
          { user: senderId },
          { user: receiverId },
        ],
      });
      isNewChat = true;
    }

    // Populate user details
    chat = await chat.populate("participants.user", "name phone profilePic");

    res.status(isNewChat ? 201 : 200).json({
      message: isNewChat ? "Chat created" : "Chat already exists",
      chat,
    });
  }
  catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Send message (HTTP fallback)
export const sendMessageAPI = async (req, res) => {
  try {
    const {
      receiverId,
      encryptedContent,
      replyTo
    } = req.body;
    const senderId = req.user.id;

    // Validate required fields
    if (!receiverId || !encryptedContent) {
      return res.status(400).json({
        message: "Receiver and encrypted content are required"
      });
    }

    // Prevent sending message to self
    if (receiverId === senderId) {
      return res.status(400).json({ message: "Cannot send message to yourself" });
    }

    // Check if receiver exists
    const receiverUser = await User.findById(receiverId);
    if (!receiverUser) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    // Find or create chat
    let chat = await Chat.findOne({
      "participants.user": { $all: [senderId, receiverId] },
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [
          { user: senderId },
          { user: receiverId },
        ],
      });
    }

    const senderUser = await User.findById(senderId);

    const isBlocked = senderUser.blockedUsers.some(
      id =>
        id.toString() === receiverId
    ) ||
      receiverUser.blockedUsers.some(
        id =>
          id.toString() === senderId
      );

    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Cannot send message to blocked user"
      });
    }

    //Redis check
    const isReceiverOnline = await redisClient.exists(`online:${receiverId}`);
    let replyPreview = null;

    if (replyTo) {
      const originalMessage = await Message.findById(replyTo);

      if (!originalMessage) {
        return res.status(404).json({ message: "Reply message not found" });
      }

      replyPreview = {
        content: "",
        sender: originalMessage.sender,
        messageType: originalMessage.messageType,
        mediaUrl: originalMessage.mediaUrl || ""
      };
    }

    const setting = await ChatSetting.findOne({
      $or: [
        { sender: senderId, receiver: receiverId },
        { sender: receiverId, receiver: senderId }
      ]
    });
    console.log("Setting Found:", setting);

    let disappearAfter = "off";
    let expiresAt = null;

    switch (setting?.disappearingTimer) {
      case "24h":
        disappearAfter = "24h";
        expiresAt = new Date(
          Date.now() + 24 * 60 * 60 * 1000
        );
        break;

      case "7d":
        disappearAfter = "7d";
        expiresAt = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        );
        break;

      case "30d":
        disappearAfter = "30d";
        expiresAt = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        );
        break;

      default:
        disappearAfter = "off";
        expiresAt = null;
    }

    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,

      // Don't store plain text
      content: "",

      // Store encrypted text
      encryptedContent,

      replyTo,
      replyPreview,
      chatId: chat._id,
      tempId: Date.now().toString(),

      status: isReceiverOnline
        ? "delivered" : "sent",

      deliveredAt: isReceiverOnline
        ? new Date() : null,

      disappearAfter: setting?.disappearingTimer || "off",
      expiresAt
    });

    chat.lastMessage = message._id;

    await chat.save();

    res.status(201).json({
      message: "Message sent",
      data: message,
    });
  }
  catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Media sharing
export const sendMediaMessage = async (req, res) => {
  console.log("1. Request received");
  mediaUpload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const senderId = req.user.id;
      const { receiverId, caption } = req.body;
      const senderUser = await User.findById(senderId);
      const receiverUser = await User.findById(receiverId);

      if (!receiverUser) {
        return res.status(404).json({
          success: false,
          message: "Receiver not found"
        });
      }

      const isBlocked = senderUser.blockedUsers.some(
        id =>
          id.toString() === receiverId) ||
        receiverUser.blockedUsers.some(
          id =>
            id.toString() === senderId
        );

      if (isBlocked) {
        return res.status(403).json({
          success: false,
          message: "Cannot send media to blocked user"
        });
      }

      const allowedMimeTypes = [
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
      ];

      if (!req.file) {
        return res.status(400).json({ message: "No media uploaded" });
      }

      // Image limit
      if (req.file.mimetype.startsWith("image/") && req.file.size > MAX_IMAGE_SIZE) {
        return res.status(400).json({
          message: `Image size cannot exceed ${process.env.MAX_IMAGE_SIZE_MB} MB`
        });
      }

      // Audio limit
      if (req.file.mimetype.startsWith("audio/") && req.file.size > MAX_AUDIO_SIZE) {
        return res.status(400).json({
          message: `Audio size cannot exceed ${process.env.MAX_AUDIO_SIZE_MB} MB`
        });
      }

      // Video limit
      if (req.file.mimetype.startsWith("video/") && req.file.size > MAX_VIDEO_SIZE) {
        return res.status(400).json({
          message: `Video size cannot exceed ${process.env.MAX_VIDEO_SIZE_MB} MB`
        });
      }

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ message: "Unsupported file type" });
      }

      const uniqueId = crypto.randomUUID();
      console.time(`[${uniqueId}] TOTAL_REQUEST`);

      let chat = await Chat.findOne({
        "participants.user": { $all: [senderId, receiverId] }
      });

      let type = "";
      let mediaUrl = "";
      let thumbnailUrl = "";
      let originalKey = "";

      if (req.file.mimetype === "image/gif") {
        type = "image";

        const gifKey = `images/${uniqueId}.gif`;

        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: gifKey,
            Body: req.file.buffer,
            ContentType: "image/gif"
          })
        );

        mediaUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${gifKey}`;
      }

      else if (req.file.mimetype.startsWith("image")) {
        type = "image";

        const compressedBuffer = await sharp(req.file.buffer)
          .resize({ width: 1280, withoutEnlargement: true })
          .jpeg({ quality: 75 })
          .toBuffer();

        const imageKey = `images/${uniqueId}.jpg`;

        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: imageKey,
            Body: compressedBuffer,
            ContentType: "image/jpeg"
          })
        );
        mediaUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${imageKey}`;


        // Thumbnail
        const thumbBuffer = await sharp(req.file.buffer)
          .resize({ width: 250 })
          .jpeg({ quality: 50 })
          .toBuffer();

        const thumbKey = `thumbs/${uniqueId}.jpg`;

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

      else if (req.file.mimetype.startsWith("video")) {

        type = "video";

        originalKey = `media/original/${uniqueId}.mp4`;

        console.time("ORIGINAL_S3_UPLOAD");

        // Upload ORIGINAL immediately
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: originalKey,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
          })
        );

        console.timeEnd("ORIGINAL_S3_UPLOAD");

        mediaUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${originalKey}`;
      }

      else if (req.file.mimetype.startsWith("audio")) {
        type = "audio";
        console.log("Original Audio Size:", (req.file.size / 1024 / 1024).toFixed(2), "MB");

        const ext = path.extname(req.file.originalname);
        const tempInput = path.join(
          os.tmpdir(),
          `${uniqueId}-input${ext}`
        );

        const tempCompressed = path.join(
          os.tmpdir(),
          `${uniqueId}-compressed.mp3`
        );

        // Save original audio
        fs.writeFileSync(tempInput, req.file.buffer);

        // Compress audio
        await new Promise((resolve, reject) => {
          ffmpeg(tempInput)
            .audioCodec("libmp3lame")
            .audioBitrate("128k")
            .format("mp3")
            .on("start", cmd => {
              console.log("FFmpeg Command:", cmd);
            })
            .on("end", resolve)
            .on("error", reject)
            .save(tempCompressed);
        });

        // Read compressed audio
        const compressedBuffer = fs.readFileSync(tempCompressed);
        console.log("Compressed Audio Size:", (compressedBuffer.length / 1024 / 1024).toFixed(2), "MB");
        const key = `media/${uniqueId}.mp3`;

        // Upload compressed audio
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: key,
            Body: compressedBuffer,
            ContentType: "audio/mpeg"
          })
        );

        mediaUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

        // Cleanup
        [
          tempInput,
          tempCompressed
        ].forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
      }

      console.time(`[${uniqueId}] mongo-message-create`);

      const isReceiverOnline = await redisClient.exists(`online:${receiverId}`);
      const tempId = crypto.randomUUID();
      const message = await Message.create({
        sender: senderId,
        receiver: receiverId,
        chatId: chat._id,
        tempId,
        content: "",
        encryptedContent: "",
        mediaUrl: mediaUrl,
        mediaSize: req.file.size,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        messageType: type,
        mediaType: type,
        thumbnailUrl: thumbnailUrl,
        caption: caption || "",
        audioDuration: req.body.duration || 0,
        waveform: req.body.waveform ? JSON.parse(req.body.waveform) : [],
        status: isReceiverOnline ? "delivered" : "sent",
        deliveredAt: isReceiverOnline ? new Date() : null,
        tempId: crypto.randomUUID()
      });

      chat.lastMessage = message._id;
      await chat.save();
      console.timeEnd(`[${uniqueId}] mongo-message-create`);

      if (type === "video") {
        setImmediate(() => {
          compressVideoInBackground(
            message._id,
            uniqueId,
            originalKey
          ).catch(console.error);
        });
      }

      const roomId = [String(senderId), String(receiverId)].sort().join("_");

      const io = req.app.get("io");
      if (io) {
        io.to(roomId).emit("new_message", message);
      }
      console.timeEnd(`[${uniqueId}] TOTAL_REQUEST`);
      console.log(`[${uniqueId}] Sending response to client`);
      res.status(201).json({
        message: "Media sent",
        data: message
      });
    }
    catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};

// Get messages
export const getMessagesByChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Validate chatId
    if (!chatId) {
      return res.status(400).json({ message: "Chat ID is required" });
    }

    // Check if chat exists
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Optional: Check if user is part of chat
    const isParticipant = chat.participants.some(
      (p) => p.user.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get messages
    const messages = await Message.find({
      chatId,
      deletedFor: { $ne: userId }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

      // Populate
      // Sender
      .populate({
        path: "sender",
        select: "name profilePic"
      })

      // Receiver
      .populate({
        path: "receiver",
        select: "name profilePic"
      })

      // Reply original message
      .populate({
        path: "replyTo",
        select: "encryptedContent sender messageType mediaUrl"
      })

      // Reply preview sender
      .populate({
        path: "replyPreview.sender",
        select: "name profilePic"
      })

      // Forward original sender
      .populate({
        path: "forwardedFrom",
        select: "name profilePic"
      });

    res.status(200).json({
      message: messages.length > 0
        ? "Messages fetched"
        : "No messages found",
      data: messages
    });
  }
  catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get chat and group list with unread count
export const getChatList = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // Get chats
    const chats = await Chat.aggregate([
      {
        $match: {
          participants: {
            $elemMatch: {
              user: userId,
              archived: false
            }
          }
        }
      },
      {
        $lookup: {
          from: "messages",
          let: { chatId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$chatId", "$$chatId"] },
                receiver: userId,
                status: { $ne: "read" },
                isDeleted: false
              },
            },
          ],
          as: "unreadMessages",
        },
      },
      {
        $addFields: {
          unreadCount: { $size: "$unreadMessages" },

          pinned: {
            $let: {
              vars: {
                currentParticipant: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$participants",
                        as: "participant",
                        cond: {
                          $eq: ["$$participant.user", userId]
                        }
                      }
                    },
                    0
                  ]
                }
              },
              in: "$$currentParticipant.pinned"
            }
          }
        }
      },
      {
        $sort: { updatedAt: -1 },
      },
    ]);

    // Get groups
    const groups = await Group.find({
      participants: {
        $elemMatch: {
          user: userId,
          archived: false
        }
      }
    })
      .populate(
        "participants.user",
        "name profilePic"
      )
      .populate(
        "lastMessage"
      )
      .sort({
        updatedAt: -1
      });

    const formattedChats = chats.map(chat => ({
      ...chat,
      type: "chat"
    }));

    const formattedGroups = groups.map(group => {
      const currentParticipant = group.participants.find(
        p => p.user._id.toString() === userId.toString()
      );

      return {
        _id: group._id,
        type: "group",
        groupName: group.groupName,
        groupPhoto: group.groupPhoto,
        description: group.description,
        participants: group.participants,
        lastMessage: group.lastMessage,
        unreadCount: 0,
        pinned: currentParticipant?.pinned || false,
        updatedAt: group.updatedAt
      };
    });

    const chatList = [
      ...formattedChats,
      ...formattedGroups
    ].sort(
      (a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    res.json({
      success: true,
      data: chatList
    });
  }
  catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Archive chat
export const archiveChat = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;

    await Chat.findOneAndUpdate(
      { _id: chatId, "participants.user": userId },
      { $set: { "participants.$.archived": true } }
    );

    res.json({ message: "Chat archived" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Unarchive chat
export const unarchiveChat = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;

    await Chat.findOneAndUpdate(
      { _id: chatId, "participants.user": userId },
      { $set: { "participants.$.archived": false } }
    );

    res.json({ message: "Chat unarchived" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete message for me
export const deleteMessageForMe = async (req, res) => {
  try {
    const { messageId } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // already deleted
    if (message.deletedFor.includes(userId)) {
      return res.json({ message: "Already deleted for you" });
    }

    message.deletedFor.push(userId);
    await message.save();

    res.json({ message: "Message deleted for you" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete message for everyone
export const deleteMessageForEveryone = async (req, res) => {
  try {
    const { messageId } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Only sender can delete for everyone
    if (message.sender.toString() !== userId) {
      return res.status(403).json({ message: "Not allowed" });
    }

    // Delete time limit
    const DELETE_TIME_LIMIT = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const messageTime = new Date(message.createdAt).getTime();

    if (now - messageTime > DELETE_TIME_LIMIT) {
      return res.status(403).json({ message: "Delete time limit reached" });
    }

    // Delete media
    if (message.mediaUrl) {
      await deleteMediaFromS3(message.mediaUrl);
    }

    if (message.thumbnailUrl) {
      await deleteMediaFromS3(message.thumbnailUrl);
    }

    message.isDeleted = true;
    message.content = "";
    message.encryptedContent = "";
    message.caption = "",
      message.mediaUrl = "";
    message.thumbnailUrl = "";
    message.filePath = "";
    message.fileName = "";
    message.fileType = "";
    message.waveform = [];
    message.audioDuration = 0;
    message.deletedAt = new Date();

    await message.save();

    res.json({ message: "Message deleted for everyone" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete Chat
export const deleteChat = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;

    const chat = await Chat.findOneAndUpdate(
      { _id: chatId, "participants.user": userId },
      {
        $set: {
          "participants.$.archived": true
        }
      }
    );

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    res.json({ message: "Chat deleted (archived)" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

//Save FCM token for a user
export const saveToken = async (req, res) => {
  const { userId, fcmToken } = req.body;
  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.fcmToken = fcmToken;
    user.fcmStatus = true;

    await user.save();

    console.log(`FCM Token saved for user: ${userId} ${fcmToken}`);
    res.status(200).json({ success: true });
  }
  catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to save FCM Token" });
  }
};

// Serach user
export const searchUsers = async (req, res) => {
  try {
    const keyword = req.query.q;

    if (!keyword) {
      return res.status(400).json({ message: "Search keyword is required" });
    }

    const users = await User.find({
      $and: [
        {
          $or: [
            { name: { $regex: keyword, $options: "i" } },
            { phone: { $regex: keyword, $options: "i" } }
          ]
        },
        { _id: { $ne: req.user._id } }
      ]
    }).select("_id name phone profilePic").limit(20);

    res.json(users);
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* Send FCM notification to a user*/
export const notify = async (req, res) => {
  const { receiverId, senderId, body, redir } = req.body;

  if (!receiverId || !senderId || !body || !redir) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    // receiver
    const user = await User.findById(receiverId).select("fcmToken");

    if (!user || !user.fcmToken) {
      return res.status(404).json({ message: "No token found for this user" });
    }

    // sender 
    const sender = await User.findById(senderId).select("name");

    const message = {
      token: user.fcmToken,

      notification: {
        title: sender?.name || "New Message",
        body: body
      },

      webpush: {
        fcmOptions: {
          link: redir
        }
      }
    };

    await admin.messaging().send(message);

    return res.status(200).json({
      success: true,
      message: "Notification sent"
    });
  }
  catch (err) {
    console.error("FCM Error:", err);

    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-argument"
    ) {
      await User.findByIdAndUpdate(userId, { $set: { fcmStatus: true } });

      console.log("🧹 Invalid FCM token removed");
    }

    return res.status(500).json({ message: "Failed to send notification" });
  }
};

// File upload size
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // PDF
      "application/pdf",

      // DOC
      "application/msword",

      // DOCX
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

      // XLS
      "application/vnd.ms-excel",

      // XLSX
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

      // ZIP
      "application/zip",
      "application/x-zip-compressed",

      // TXT and VCF
      "text/plain",
      "text/vcard",
      "text/x-vcard",

      // PPT
      "application/vnd.ms-powerpoint",

      // PPTX
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }

    cb(null, true);
  }
}).single("file");

// File sharing
export const sendFileMessage = async (req, res) => {
  fileUpload(req, res, async (err) => {

    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      const senderId = req.user.id;
      const { receiverId } = req.body;
      const senderUser = await User.findById(senderId);
      const receiverUser = await User.findById(receiverId);

      if (!receiverUser) {
        return res.status(404).json({
          success: false,
          message: "Receiver not found"
        });
      }

      const isBlocked = senderUser.blockedUsers.some(
        id =>
          id.toString() === receiverId) ||
        receiverUser.blockedUsers.some(
          id =>
            id.toString() === senderId
        );

      if (isBlocked) {
        return res.status(403).json({
          success: false,
          message: "Cannot send file to blocked user"
        });
      }

      if (!receiverId) {
        return res.status(400).json({ message: "ReceiverId required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      let chat = await Chat.findOne({
        "participants.user": {
          $all: [senderId, receiverId]
        }
      });

      if (!chat) {
        chat = await Chat.create({
          participants: [
            { user: senderId },
            { user: receiverId }
          ]
        });
      }

      const uniqueId = crypto.randomUUID();
      const safeFileName = req.file.originalname.replace(/\s+/g, "_");
      const fileKey = `files/${uniqueId}-${safeFileName}`;

      // Upload to S3
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: fileKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype
        })
      );

      // S3 URL
      const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

      const isReceiverOnline = await redisClient.exists(`online:${receiverId}`);
      const tempId = crypto.randomUUID();
      const message = await Message.create({
        sender: senderId,
        receiver: receiverId,
        chatId: chat._id,
        tempId,
        content: "",
        messageType: "file",
        mediaUrl: fileUrl,
        filePath: fileKey,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        fileType: req.file.mimetype,
        status: isReceiverOnline ? "delivered" : "sent",
        deliveredAt: isReceiverOnline ? new Date() : null
      });

      // update last message
      chat.lastMessage = message._id;
      await chat.save();

      // socket emit
      const roomId = [String(senderId), String(receiverId)].sort().join("_");

      const io = req.app.get("io");

      if (io) {
        io.to(roomId).emit("new_message", message);
      }

      res.status(201).json({ message: "File sent successfully", data: message });
    }
    catch (error) {
      res.status(500).json({ message: error.message });
    }
  });
};

// Get file
export const getFileMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Validate chat exists
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    // Check user belongs to chat
    const isParticipant = chat.participants.some(
      (p) => p.user.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get file messages
    const files = await Message.find({
      chatId,
      messageType: "file",
      isDeleted: false,
      deletedFor: { $ne: userId }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name profilePic");

    res.status(200).json({
      success: true,
      count: files.length,
      data: files
    });

  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Download file
export const downloadFile = async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);

   if (!message) {
      return res.status(404).json({message: "Message not found"});
    }
 
    // Security check
    if (
      message.sender.toString() !== req.user.id &&
      message.receiver?.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: "Unauthorized" });
    }
 
    let fileKey = message.filePath;
 
    // Documents use filePath.
    // Media messages (image/video/audio) use mediaUrl.
    if (!fileKey && message.mediaUrl) {
      try {
        const mediaUrl = new URL(message.mediaUrl);
 
        fileKey = decodeURIComponent(
          mediaUrl.pathname.replace(/^\/+/, "")
        );
      }
      catch (urlError) {
        console.error("Invalid media URL:", message.mediaUrl);
 
        return res.status(400).json({
          success: false,
          message: "Invalid media URL"
        });
      }
    }
 
    if (!fileKey) {
      return res.status(404).json({
        success: false,
        message: "File not found"
      });
    }

    const safeFileName = (message.fileName || 'download')
      .replace(/["\\]/g, '_');
    // Generate secure signed URL
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileKey,
      ResponseContentType: message.fileType || "application/octet-stream",
      ResponseContentDisposition: `attachment; filename="${safeFileName}"`
    });

    const signedUrl = await getSignedUrl(
      s3,
      command,
      {
        expiresIn: 60 * 5
      }
    );

    res.status(200).json({
      success: true,
      downloadUrl: signedUrl,
      fileName: message.fileName,
      fileType: message.fileType,
      fileSize: message.fileSize
    });
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get profile
export const getUserProfileView = async (req, res) => {
  try {

    const { userId } = req.params;
    const currentUserId = req.user.id;

    const user = await User.findById(userId)
      .select(
        "name profilePic status lastSeen blockedUsers blockedBy"
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const currentUser = await User.findById(currentUserId)
      .select("blockedUsers");

    const isBlocked =
      currentUser?.blockedUsers?.some(
        id => id.toString() === userId
      ) ||
      user?.blockedUsers?.some(
        id => id.toString() === currentUserId
      );

    const isOnline = await redisClient.exists(
      `online:${userId}`
    );

    return res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        profilePic: user.profilePic,

        status: isBlocked
          ? "Unavailable"
          : user.status,

        lastSeen: isBlocked
          ? null
          : user.lastSeen,

        online: isBlocked
          ? false
          : !!isOnline
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

// Get media
export const getSharedMedia = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const currentUser = await User.findById(
      currentUserId
    );

    const targetUser = await User.findById(userId);

    const isBlocked = currentUser.blockedUsers.some(
      id =>
        id.toString() === userId) ||
      targetUser.blockedUsers.some(
        id =>
          id.toString() === currentUserId
      );

    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Validate both users share a chat
    const existingChat = await Chat.findOne({
      "participants.user": {
        $all: [currentUserId, userId]
      }
    });

    if (!existingChat) {
      return res.status(403).json({ message: "Access denied" });
    }

    const mediaMessages = await Message.find({
      $or: [
        {
          sender: currentUserId,
          receiver: userId
        },
        {
          sender: userId,
          receiver: currentUserId
        }
      ],
      messageType: { $in: ["image", "video", "audio"] },
      isDeleted: false,
      deletedFor: { $ne: currentUserId }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("mediaUrl thumbnailUrl mediaType caption mediaSize createdAt");

    res.status(200).json({
      success: true,
      count: mediaMessages.length,
      data: mediaMessages
    });
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get links
export const getSharedLinks = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { userId } = req.params;
    const currentUser = await User.findById(
      currentUserId
    );

    const targetUser = await User.findById(userId);

    const isBlocked = currentUser.blockedUsers.some(
      id =>
        id.toString() === userId) ||
      targetUser.blockedUsers.some(
        id =>
          id.toString() === currentUserId
      );

    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Validate both users share a chat
    const existingChat = await Chat.findOne({
      "participants.user": {
        $all: [currentUserId, userId]
      }
    });

    if (!existingChat) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({
      $or: [
        {
          sender: currentUserId,
          receiver: userId
        },
        {
          sender: userId,
          receiver: currentUserId
        }
      ],
      messageType: "text",
      content: { $regex: /(https?:\/\/[^\s]+)/g },
      isDeleted: false,
      deletedFor: { $ne: currentUserId }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const links = [];

    messages.forEach((msg) => {
      const foundLinks = msg.content.match(/(https?:\/\/[^\s]+)/g);

      if (foundLinks) {
        foundLinks.forEach((link) => {
          links.push({
            url: link,
            sender: msg.sender,
            createdAt: msg.createdAt
          });
        });
      }
    });

    res.status(200).json({
      success: true,
      count: links.length,
      data: links
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Forward message
export const forwardMessage = async (req, res) => {
  try {
    const { originalMessageId, receiverId } = req.body;
    const senderId = req.user.id;
    const senderUser = await User.findById(senderId);
    const receiverUser = await User.findById(receiverId);

    const isBlocked = senderUser.blockedUsers.some(
      id =>
        id.toString() === receiverId) ||
      receiverUser.blockedUsers.some(
        id => id.toString() === senderId
      );

    if (isBlocked) {
      return res.status(403).json({
        success: false,
        message: "Cannot forward message to blocked user"
      });
    }

    if (!originalMessageId || !receiverId) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const originalMessage = await Message.findById(originalMessageId);

    if (!originalMessage) {
      return res.status(404).json({ message: "Original message not found" });
    }

    let chat = await Chat.findOne({
      "participants.user": { $all: [senderId, receiverId] }
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [
          { user: senderId },
          { user: receiverId }
        ]
      });
    }

    const tempId = crypto.randomUUID();

    const message = await Message.create({
      sender: senderId,
      receiver: receiverId,
      chatId: chat._id,
      tempId,
      content: "",
      encryptedContent: originalMessage.encryptedContent,
      messageType: originalMessage.messageType,
      mediaType: originalMessage.mediaType,
      mediaUrl: originalMessage.mediaUrl,
      thumbnailUrl: originalMessage.thumbnailUrl,
      caption: originalMessage.caption,

      fileName: originalMessage.fileName,
      filePath: originalMessage.filePath,
      fileType: originalMessage.fileType,
      fileSize: originalMessage.fileSize,

      waveform: originalMessage.waveform,
      audioDuration: originalMessage.audioDuration,

      isForwarded: true,
      forwardedFrom: originalMessage.sender
    });

    chat.lastMessage = message._id;

    await chat.save();

    res.status(201).json({
      success: true,
      data: message
    });
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Pin messages
export const pinMessage = async (req, res) => {
  try {
    const { messageId } = req.body;
    const userId = req.user.id;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.isPinned = true;
    message.pinnedBy = userId;
    message.pinnedAt = new Date();

    await message.save();

    res.status(200).json({
      success: true,
      message: "Message pinned"
    });
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Unpin messages
export const unpinMessage = async (req, res) => {
  try {
    const { messageId } = req.body;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    message.isPinned = false;
    message.pinnedBy = null;
    message.pinnedAt = null;

    await message.save();

    res.status(200).json({
      success: true,
      message: "Message unpinned"
    });
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get pinned messages
export const getPinnedMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const messages = await Message.find({
      chatId,
      isPinned: true,
      isDeleted: false
    })
      .sort({ pinnedAt: -1 })
      .populate("sender", "name profilePic");

    res.status(200).json({
      success: true,
      data: messages
    });
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark unread
export const markChatUnread = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;
    const chat = await Chat.findOneAndUpdate(
      {
        _id: chatId,
        "participants.user": userId
      },
      {
        $set: {
          "participants.$.markedUnread": true,
          "participants.$.markedUnreadAt": new Date()
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    res.status(200).json({
      success: true,
      message: "Chat marked as unread"
    });
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark read
export const markChatRead = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;
    await Message.updateMany(
      {
        chatId,
        receiver: userId,
        status: { $ne: "read" }
      },
      {
        status: "read",
        readAt: new Date()
      }
    );

    await Chat.updateOne(
      {
        _id: chatId,
        "participants.user": userId
      },
      {
        $set: {
          "participants.$.markedUnread": false,
          "participants.$.markedUnreadAt": null
        }
      }
    );

    res.status(200).json({
      success: true,
      message: "Chat marked as read"
    });
  }
  catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Disappering timer
export const setDisappearingTimer = async (req, res) => {
  try {
    const { sender, receiver, timer } = req.body;

    let expiresAt = null;

    switch (timer) {
      case "24h":
        expiresAt = new Date(
          Date.now() + 24 * 60 * 60 * 1000
        );
        break;

      case "7d":
        expiresAt = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        );
        break;

      case "30d":
        expiresAt = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        );
        break;

      default:
        expiresAt = null;
    }
    console.log("Timer:", timer);
    console.log("ExpiresAt:", expiresAt);

    const setting = await ChatSetting.findOneAndUpdate(
      {
        sender,
        receiver
      },
      {
        disappearingTimer: timer,
        expiresAt
      },
      {
        new: true,
        upsert: true
      }
    );

    console.log("Saved Setting:", setting);

    return res.status(200).json({
      success: true,
      setting
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get disappearing status
export const getDisappearingStatus = async (req, res) => {
  try {
    const { sender, receiver } = req.query;

    const setting = await ChatSetting.findOne({
      sender,
      receiver
    });

    return res.status(200).json({
      success: true,
      timer: setting?.disappearingTimer || "off",
      expiresAt: setting?.expiresAt || null
    });
  }
  catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Pin chat
export const pinChat = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;

    const chat = await Chat.findOneAndUpdate(
      {
        _id: chatId,
        "participants.user": userId
      },
      {
        $set: {
          "participants.$.pinned": true
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found"
      });
    }

    res.json({
      success: true,
      message: "Chat pinned"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Unpin chat
export const unpinChat = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;

    const chat = await Chat.findOneAndUpdate(
      {
        _id: chatId,
        "participants.user": userId
      },
      {
        $set: {
          "participants.$.pinned": false
        }
      },
      { new: true }
    );

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found"
      });
    }

    res.json({
      success: true,
      message: "Chat unpinned"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Clear chat
export const clearChat = async (req, res) => {
  try {
    const { chatId } = req.body;
    const userId = req.user.id;

    if (!chatId) {
      return res.status(400).json({
        success: false,
        message: "Chat ID is required"
      });
    }

    // Check whether the chat exists and user belongs to it
    const chat = await Chat.findOne({
      _id: chatId,
      "participants.user": userId
    });

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found"
      });
    }

    // Hide all existing messages only for this user
    const result = await Message.updateMany(
      {
        chatId: chatId,
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
      message: "Chat cleared successfully",
      clearedMessages: result.modifiedCount
    });
  }
  catch (err) {
    console.error("Clear chat error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to clear chat"
    });
  }
};
