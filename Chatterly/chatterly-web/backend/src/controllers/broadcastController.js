import Broadcast from "../models/Broadcast.js";
import User from "../models/User.js";
import Chat from "../models/Chat.js";
import Message from "../models/Message.js";
import { getIO } from "../sockets/socketServer.js";
import crypto from "crypto";

// CREATE BROADCAST
export const createBroadcast = async (req, res) => {
  try {
    const { name, participants } = req.body;

    // Validate
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Broadcast name is required",
      });
    }

    if (!participants || participants.length < 1) {
      return res.status(400).json({
        success: false,
        message: "At least one participant is required",
      });
    }

    const uniqueParticipants = [...new Set(participants)];

    const filteredParticipants = uniqueParticipants.filter(
      id =>
        id.toString() !==
        req.user.id.toString()
    );

    if (filteredParticipants.length < 1) {
      return res.status(400).json({
        success:false,
        message:"At least one valid participant is required"
      });
    }

    // Verify users exist
    const users = await User.find({
      _id: { $in: filteredParticipants }
    });

    if (users.length !== filteredParticipants.length) {
      return res.status(400).json({
        success: false,
        message: "One or more users not found",
      });
    }

    const broadcast = await Broadcast.create({
      name,
      createdBy: req.user.id,
      participants: filteredParticipants,
    });

    return res.status(201).json({
      success: true,
      message: "Broadcast created successfully",
      data: broadcast,
    });
  }
  catch (error) {
    console.error("Create Broadcast Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create broadcast",
      error: error.message,
    });
  }
};

// GET BROADCAST DETAILS
export const getBroadcastDetails = async (req, res) => {
  try {
    const { broadcastId } = req.params;

    const broadcast = await Broadcast.findById(broadcastId)
    .populate(
      "createdBy",
      "name email profilePic"
    )
    .populate(
      "participants",
      "name email profilePic"
    );

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: "Broadcast not found",
      });
    }

    if (
      broadcast.createdBy._id.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success:false,
        message:"Access denied"
      });
    }

    return res.status(200).json({
      success: true,
      data: broadcast,
    });
  }
  catch (error) {
    console.error(
      "Get Broadcast Details Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:"Failed to fetch broadcast details",
      error: error.message,
    });
  }
};

// GET MY BROADCAST LISTS
export const getMyBroadcastLists = async (req, res) => {
  try {
    const broadcasts = await Broadcast.find({
      createdBy: req.user.id,
    })
    .populate(
      "participants",
      "name email profilePic"
    )
    .sort({
      createdAt: -1,
    });

    return res.status(200).json({
      success: true,
      count: broadcasts.length,
      data: broadcasts,
    });
  }
  catch (error) {
    console.error(
      "Get My Broadcasts Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch broadcast lists",
      error: error.message,
    });
  }
};

// SEND BROADCAST MESSAGE
export const sendBroadcastMessage = async (req, res) => {
  try {
    const { broadcastId, content } = req.body;

    if (!broadcastId || !content) {
      return res.status(400).json({
        success: false,
        message: "broadcastId and content are required",
      });
    }

    const broadcast = await Broadcast.findById(broadcastId);
    
    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: "Broadcast not found",
      });
    }

    if (
      broadcast.createdBy.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success:false,
        message:"Only broadcast owner can perform this action"
      });
    }

    const senderId = req.user.id;

    const createdMessages = [];

    for (const receiverId of broadcast.participants) {
      // Find existing private chat
      let chat = await Chat.findOne({
        "participants.user": {
          $all: [senderId, receiverId]
        }
      });

      // Create chat if not exists
      if (!chat) {
        chat = await Chat.create({
          participants: [
            { user: senderId },
            { user: receiverId }
          ]
        });
      }

      // Create message
      const message = await Message.create({
        chatId: chat._id,
        sender: senderId,
        receiver: receiverId,
        content,
        messageType: "text",
        tempId: crypto.randomUUID()
      });

      chat.lastMessage = message._id;
      await chat.save();
      createdMessages.push(message);

      // SOCKET EVENT
      const io = getIO();

      if (io) {
        io.to(receiverId.toString()).emit(
          "broadcast_message",
          {
            broadcastId,
            messageId: message._id,
            sender: senderId,
            receiver: receiverId,
            content,
            createdAt: message.createdAt
          }
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Broadcast sent successfully",
      totalRecipients: broadcast.participants.length,
      messagesCreated: createdMessages.length
    });
  }
  catch (error) {
    console.error(
      "Send Broadcast Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to send broadcast",
      error: error.message
    });
  }
};

// ADD MEMBER TO BROADCAST
export const addBroadcastMember = async (req, res) => {
  try {
    const { broadcastId, userId } = req.body;
    const broadcast = await Broadcast.findById(broadcastId);

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: "Broadcast not found"
      });
    }

    if (
      broadcast.createdBy.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success:false,
        message:"Only broadcast owner can perform this action"
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const alreadyExists = broadcast.participants.some(
      participant =>
        participant.toString() === userId
    );

    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        message: "User already exists"
      });
    }

    broadcast.participants.push(userId);

    await broadcast.save();

    return res.status(200).json({
      success: true,
      message: "Member added successfully",
      data: broadcast
    });
  }
  catch (error) {
    console.error(
      "Add Broadcast Member Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to add member",
      error: error.message
    });
  }
};

// REMOVE MEMBER FROM BROADCAST
export const removeBroadcastMember = async (req, res) => {
  try {
    const { broadcastId, userId } = req.body;
    const broadcast = await Broadcast.findById(broadcastId);

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: "Broadcast not found"
      });
    }

    if (
      broadcast.createdBy.toString() !==
      req.user.id.toString()
    ) {
      return res.status(403).json({
        success:false,
        message:"Only broadcast owner can perform this action"
      });
    }

    broadcast.participants = broadcast.participants.filter(
      participant =>
        participant.toString() !==
        userId
    );

    await broadcast.save();

    return res.status(200).json({
      success: true,
      message:"Member removed successfully",
      data: broadcast
    });
  }
  catch (error) {
    console.error(
      "Remove Broadcast Member Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:"Failed to remove member",
      error: error.message
    });
  }
};

// Delete broadcast
export const deleteBroadcast = async (req, res) => {
  try {
    const { broadcastId } = req.body;
    const userId = req.user.id;

    if (!broadcastId) {
      return res.status(400).json({
        success: false,
        message: "Broadcast ID is required",
      });
    }

    const broadcast = await Broadcast.findOne({
      _id: broadcastId,
      createdBy: userId,
    });

    if (!broadcast) {
      return res.status(404).json({
        success: false,
        message: "Broadcast not found or you are not the creator",
      });
    }

    await Broadcast.deleteOne({
      _id: broadcastId,
      createdBy: userId,
    });

    return res.status(200).json({
      success: true,
      message: "Broadcast deleted successfully",
    });

  } catch (error) {
    console.error("Delete Broadcast Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete broadcast",
    });
  }
};