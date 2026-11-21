import GroupCall from "../models/GroupCall.js";
import Group from "../models/Group.js";
import crypto from "crypto";
import Message from "../models/Message.js";

// Start group call
export const startGroupCall = async ({
    groupId,
    userId,
    type
}) => {
    const group = await Group.findById(groupId);

    if (!group) {
        throw new Error("Group not found");
    }

    if (!["audio", "video"].includes(type)) {
        throw new Error("Invalid call type");
    }

    const participant = group.participants.find(
        p => p.user.toString() === userId.toString()
    );

    if (!participant) {
        throw new Error("You are not a group member");
    }

    const activeCall = await GroupCall.findOne({
        groupId,
        status: {
            $in: ["active", "locked"]
        }
    });

    if (activeCall) {
        throw new Error("Group call already active");
    }

    const call = await GroupCall.create({
        groupId,
        startedBy: userId,
        type,
        participants: [
            {
                user: userId,
                joinedAt: new Date()
            }
        ]
    });

    return call;
};

// Join call
export const joinGroupCall = async ({
    groupCallId,
    userId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    if (call.status === "locked") {
        throw new Error("Meeting is locked");
    }

    if (call.status === "ended") {
        throw new Error("Call already ended");
    }

    const participant = call.participants.find(
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

// Leave call
export const leaveGroupCall = async ({
    groupCallId,
    userId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    const participant = call.participants.find(
        p => p.user.toString() === userId.toString()
    );

    if (participant) {
    participant.leftAt = new Date();

        if (
            call.screenSharingUser &&
            call.screenSharingUser.toString() === userId.toString()
        ) {
            call.screenSharingUser = null;
            call.isScreenSharing = false;
        }
    }

    const activeParticipants = call.participants.filter(
        p => !p.leftAt
    );

    if (activeParticipants.length === 0) {
        call.screenSharingUser = null;
        call.isScreenSharing = false;
        call.status = "ended";
        call.endedAt = new Date();

        call.duration = Math.floor(
            (
                call.endedAt.getTime() -
                call.startedAt.getTime()
            ) / 1000
        );
    }

    await call.save();

    return call;
};

// End call
export const endGroupCall = async ({groupCallId}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    const endTime = new Date();

    // Mark all active participants as left
    call.participants.forEach((participant) => {
        if (!participant.leftAt) {
            participant.leftAt = endTime;
        }
    });

    call.status = "ended";
    call.endedAt = endTime;

    call.duration = Math.floor(
        (endTime.getTime() - call.startedAt.getTime()) / 1000
    );

    call.screenSharingUser = null;
    call.isScreenSharing = false;

    await call.save();

    return call;
};

// Save group call log
export const saveGroupCallLog = async ({
    groupId,
    groupCallId = null,
    senderId,
    type,
    duration = 0,
    status
}) => {
    let text = "";

    switch (status) {
        case "ended":
            text = `${type} group call ended (${duration}s)`;
            break;

        case "not_answered":
            text = `${type} group call - Not Answered`;
            break;

        default:
            text = `${type} group call`;
    }

    const message = await Message.create({
        groupId,
        sender: senderId,
        callId: groupCallId,
        messageType: "call",
        callStatus: status,
        callType: type,
        encryptedContent: text,
        tempId: crypto.randomUUID()
    });

    await Group.findByIdAndUpdate(groupId, {
        lastMessage: message._id
    });

    return message;
};

// Lock call
export const lockGroupCall = async ({ groupCallId }) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    call.status = "locked";

    await call.save();

    return call;
};

// Unlock call
export const unlockGroupCall = async ({ groupCallId }) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    call.status = "active";

    await call.save();

    return call;
};

// Mute participant
export const muteParticipant = async ({
    groupCallId,
    targetUserId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    const participant = call.participants.find(
        p => p.user.toString() === targetUserId
    );

    if (!participant) {
        throw new Error("Participant not found");
    }

    if (participant.leftAt) {
        throw new Error("Participant already left");
    }

    participant.isMuted = true;

    await call.save();

    return call;
};

// Unmute self
export const unmuteSelf = async ({
    groupCallId,
    userId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    const participant = call.participants.find(
        p => p.user.toString() === userId.toString()
    );

    if (!participant) {
        throw new Error("Participant not found");
    }

    participant.isMuted = false;

    await call.save();

    return call;
};

// Add participant
export const addParticipantToCall = async ({
    groupCallId,
    targetUserId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    if (call.status === "ended") {
        throw new Error("Call already ended");
    }

    const exists = call.participants.find(
        p => p.user.toString() === targetUserId
    );

    if (exists) {
        throw new Error("User already in call");
    }

    const group = await Group.findById(call.groupId);

    const member = group.participants.find(
        p => p.user.toString() === targetUserId
    );

    if (!member) {
        throw new Error("User is not a group member");
    }

    if (call.status === "locked") {
        throw new Error("Meeting is locked");
    }

    call.participants.push({
        user: targetUserId,
        joinedAt: new Date()
    });

    await call.save();

    return call;
};

// Remove participant
export const removeParticipant = async ({
    groupCallId,
    targetUserId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    if (call.startedBy.toString() === targetUserId) {
        throw new Error("Host cannot be removed");
    }

    call.participants = call.participants.filter(
        p => p.user.toString() !== targetUserId
    );

    await call.save();

    return call;
};

// Admin validation
export const validateGroupCallAdmin = async ({
    groupCallId,
    userId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    const group = await Group.findById(call.groupId);

    if (!group) {
        throw new Error("Group not found");
    }

    const member = group.participants.find(
        p => p.user.toString() === userId.toString()
    );

    if (!member) {
        throw new Error("Not a group member");
    }

    const allowedRoles = [
        "superadmin",
        "admin"
    ];

    if (!allowedRoles.includes(member.role)) {
        throw new Error(
            "Only admins can perform this action"
        );
    }

    return {
        call,
        group,
        member
    };
};

// Pin participant
export const pinParticipant = async ({groupCallId, targetUserId}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    const participant = call.participants.find(
        p => p.user.toString() === targetUserId
        );

    if (!participant) {
        throw new Error("Participant not found");
    }

    return call;
};

// Start screen sharing
export const startScreenShare = async ({
    groupCallId,
    userId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
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
        throw new Error("Not part of call");
    }

    call.isScreenSharing = true;
    call.screenSharingUser = userId;

    await call.save();

    return call;
};

// Stop screen sharing
export const stopScreenShare = async ({
    groupCallId,
    userId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
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

// Hold group call
export const holdGroupCall = async ({
    groupCallId,
    userId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    if (call.status !== "active") {
        throw new Error("Group call is not active");
    }

    const participant = call.participants.find(
        p =>
            p.user.toString() === userId.toString() &&
            !p.leftAt
    );

    if (!participant) {
        throw new Error("You are not in this call");
    }

    if (participant.isOnHold) {
        throw new Error("You are already on hold");
    }

    participant.isOnHold = true;

    await call.save();

    return call;
};

// Resume group call
export const resumeGroupCall = async ({
    groupCallId,
    userId
}) => {
    const call = await GroupCall.findById(groupCallId);

    if (!call) {
        throw new Error("Group call not found");
    }

    const participant = call.participants.find(
        p =>
            p.user.toString() === userId.toString() &&
            !p.leftAt
    );

    if (!participant) {
        throw new Error("You are not in this call");
    }

    if (!participant.isOnHold) {
        throw new Error("You are not on hold");
    }

    participant.isOnHold = false;

    await call.save();

    return call;
};
