import Call from "../models/CallLog.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import redisClient from "../config/redis.js";
import Message from "../models/Message.js";
import crypto from "crypto";

// Start call
export const startCall = async ({
    callerId,
    receiverId,
    type = "audio"
}) => {
    if (!["audio", "video"].includes(type)) {
        throw new Error("Invalid call type");
    }

    if (callerId === receiverId) {
        throw new Error("Cannot call yourself");
    }

    const receiver = await User.findById(receiverId);

    if (!receiver) {
        throw new Error("Receiver not found");
    }

    // Find existing chat
    let chat = await Chat.findOne({
        $and: [
            {
                "participants.user": callerId
            },
            {
                "participants.user": receiverId
            }
        ]
    });

    // Create new chat if needed
    if (!chat) {
        chat = await Chat.create({
            participants: [
                {
                    user: callerId
                },
                {
                    user: receiverId
                }
            ]
        });
    }

    // Caller busy
    const callerBusy = await Call.findOne({
        $or: [
            {
                caller: callerId
            },
            {
                receiver: callerId
            }
        ],
        status: {$in: ["calling", "connected"]}
    });

    if (callerBusy) {
        throw new Error("You are already in another call");
    }

    // Receiver busy
    const receiverBusy = await Call.findOne({
        $or: [
            {
                caller: receiverId
            },
            {
                receiver: receiverId
            }
        ],
        status: {$in: ["calling", "connected"]}
    });

    if (receiverBusy) {
        throw new Error("User is busy");
    }

    // Receiver online
    const receiverSocket = await redisClient.get(`online:${receiverId}`);
    const status = receiverSocket ? "calling" : "missed";

    const call = await Call.create({
        caller: callerId,
        receiver: receiverId,
        participants: [
            {
                user: callerId,
                joinedAt: new Date()
            },
            {
                user: receiverId,
                joinedAt: new Date()
            }
        ],
        chat: chat._id,
        type,
        status,
        endedAt: receiverSocket ? null : new Date()
    });

    return {
        call,
        chat,
        isReceiverOnline: !!receiverSocket
    };
};

// Save call
export const saveCallLog = async ({
    chatId,
    senderId,
    receiverId,
    callId,
    status,
    type = "audio",
    duration = 0
}) => {
    let text = "";

    switch (status) {
        case "completed":
            text = `${type} call completed (${duration}s)`;
            break;

        case "missed":
            text = `Missed ${type} call`;
            break;

        case "not_answered":
            text = `Outgoing ${type} call - Not Answered`;
            break;

        case "rejected":
            text = `${type} call rejected`;
            break;

        case "cancelled":
            text = `${type} call cancelled`;
            break;

        default:
            text = `${type} call`;
    }

    const message = await Message.create({
        chatId,
        sender: senderId,
        receiver: receiverId,
        tempId: crypto.randomUUID(),
        encryptedContent: text,
        messageType: "call",
        callId,
        callStatus: status,
        callType: type
    });

    // Update chat last message
    await Chat.findByIdAndUpdate(chatId, {
        lastMessage: message._id
    });

    return message;
};

// Hold call
export const holdCall = async ({
    callId,
    userId
}) => {
    const call = await Call.findById(callId);

    if (!call) {
        throw new Error("Call not found");
    }

    if (call.status !== "connected") {
        throw new Error("Call is not connected");
    }

    const participant = call.participants.find(
        p => p.user.toString() === userId.toString() && !p.leftAt
    );

    if (!participant) {
        throw new Error("Unauthorized");
    }

    if (participant.isOnHold) {
        throw new Error("You are already on hold");
    }

    participant.isOnHold = true;

    await call.save();

    return call;
};

// Resume call
export const resumeCall = async ({
    callId,
    userId
}) => {
    const call = await Call.findById(callId);

    if (!call) {
        throw new Error("Call not found");
    }

    const participant = call.participants.find(
        p => p.user.toString() === userId.toString() && !p.leftAt
    );

    if (!participant) {
        throw new Error("Unauthorized");
    }

    if (!participant.isOnHold) {
        throw new Error("You are not on hold");
    }

    participant.isOnHold = false;

    await call.save();

    return call;
};

// Add participant to conference call (Invite only)
export const addParticipantToCall = async ({
    callId,
    targetUserId
}) => {
    const call = await Call.findById(callId);

    if (!call) {
        throw new Error("Call not found");
    }

    if (call.status !== "connected") {
        throw new Error("Call is not connected");
    }

    const user = await User.findById(targetUserId);

    if (!user) {
        throw new Error("User not found");
    }

    const activeParticipant = call.participants.find(
        p =>
            p.user.toString() === targetUserId.toString() &&
            !p.leftAt
    );

    if (activeParticipant) {
        throw new Error("User is already in the conference");
    }

    // Invitation only
    return call;
};

// Join conference call
export const joinConferenceCall = async ({
    callId,
    userId
}) => {
    const call = await Call.findById(callId);

    if (!call) {
        throw new Error("Call not found");
    }

    if (call.status !== "connected") {
        throw new Error("Call is not connected");
    }

    let participant = call.participants.find(
        p => p.user.toString() === userId.toString()
    );

    if (participant) {

        if (!participant.leftAt) {
            throw new Error("User already joined");
        }

        participant.leftAt = null;
        participant.joinedAt = new Date();
    }
    else {

        call.participants.push({
            user: userId,
            joinedAt: new Date()
        });
    }

    await call.save();

    return call;
};

// Start screen sharing
export const startScreenShare = async ({
    callId,
    userId
}) => {
    const call = await Call.findById(callId);

    if (!call) {
        throw new Error("Call not found");
    }

    if (call.status !== "connected") {
        throw new Error("Call is not connected");
    }

    if (call.isScreenSharing) {
        throw new Error("Someone is already sharing screen");
    }

    const participant = call.participants.find(
        p =>
            p.user.toString() === userId.toString() &&
            !p.leftAt
    );

    if (!participant) {
        throw new Error("You are not in this call");
    }

    call.isScreenSharing = true;
    call.screenSharingUser = userId;

    await call.save();

    return call;
};

// Stop screen sharing
export const stopScreenShare = async ({
    callId,
    userId
}) => {
    const call = await Call.findById(callId);

    if (!call) {
        throw new Error("Call not found");
    }

    if (
        !call.screenSharingUser ||
        call.screenSharingUser.toString() !== userId.toString()
    ) {
        throw new Error(
            "Only sharing user can stop screen sharing"
        );
    }

    call.isScreenSharing = false;
    call.screenSharingUser = null;

    await call.save();

    return call;
};
