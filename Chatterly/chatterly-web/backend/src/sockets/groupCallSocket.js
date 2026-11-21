import GroupCall from "../models/GroupCall.js";
import Group from "../models/Group.js";
import {
    startGroupCall,
    joinGroupCall,
    leaveGroupCall,
    endGroupCall,
    saveGroupCallLog,
    lockGroupCall,
    unlockGroupCall,
    muteParticipant,
    unmuteSelf,
    addParticipantToCall,
    removeParticipant,
    validateGroupCallAdmin,
    pinParticipant,
    startScreenShare,
    stopScreenShare,
    holdGroupCall,
    resumeGroupCall
} from "../services/groupCallService.js";
import admin from "../config/firebase.js";
import Message from "../models/Message.js";
import crypto from "crypto";

const registerGroupCallHandlers = (io, socket) => {
    // Start group call
    socket.on("group_call_start", async (data, callback) => {
        try {
            const {
                groupId,
                type = "video"
            } = data;

            const call = await startGroupCall({
                groupId,
                userId: socket.userId,
                type
            });

            const message = await Message.create({
                groupId,
                sender: socket.userId,
                callId: call._id,
                messageType: "call",
                callStatus: "started",
                callType: type,
                encryptedContent: `${type} group call started`,
                tempId: crypto.randomUUID()
            });

            // Auto end call if no one joins 30 sec
            setTimeout(async () => {
                const latestCall = await GroupCall.findById(call._id);

                if (!latestCall) {
                    return;
                }

                const activeParticipants = latestCall.participants.filter(
                    p => !p.leftAt
                );

                // only creator remains
                if (
                    latestCall.status !== "ended" &&
                    latestCall.participants.length === 1 &&
                    activeParticipants.length === 1
                ) {
                    latestCall.status = "ended";
                    latestCall.endedAt = new Date();
                    latestCall.duration = 0;

                    await latestCall.save();

                    const message = await saveGroupCallLog({
                        groupId: latestCall.groupId,
                        groupCallId: latestCall._id,
                        senderId: latestCall.startedBy,
                        type: latestCall.type,
                        duration: 0,
                        status: "not_answered"
                    });

                    io.to(latestCall.groupId.toString()).emit(
                        "receiveGroupMessage",
                        message
                    );

                    io.to(`groupcall_${latestCall._id}`).emit(
                        "group_call_ended",
                        {
                            groupCallId: latestCall._id,
                            reason: "No participants joined"
                        }
                    );
                }
            }, 30000);

            socket.join(`groupcall_${call._id}`);

            const group = await Group.findById(groupId).populate(
                "participants.user",
                "name fcmToken"
            );

            group.lastMessage = message._id;
            await group.save();

            io.to(groupId.toString()).emit(
                "receiveGroupMessage",
                message
            );

            for (const participant of group.participants) {
                const targetUser =participant.user;

                if (targetUser._id.toString() === socket.userId) {
                    continue;
                }

                if (targetUser.fcmToken) {
                    try {
                        await admin.messaging().send({
                            token: targetUser.fcmToken,
                            notification: {
                                title: "Group Call",
                                body: `${group.groupName} started a ${type} call`
                            },
                            data: {
                                type: "group_call",
                                groupCallId: call._id.toString(),
                                groupId: groupId.toString(),
                                callType: type
                            }
                        });
                    }
                    catch (error) {
                        console.log(
                            "Group Call FCM Error:",
                            error.message
                        );
                    }
                }

                io.to(targetUser._id.toString()).emit("group_call_invitation", {
                    groupCallId: call._id,
                    groupId,
                    type,
                    startedBy: socket.userId,
                    isMidCallInvite: false
                });
            }

            io.to(`groupcall_${call._id}`).emit(
                "group_call_started",
                {
                    groupCallId: call._id,
                    groupId,
                    startedBy: socket.userId,
                    type
                }
            );

            callback?.({
                success: true,
                groupCallId: call._id
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });
    
    // Join group call
    socket.on("group_call_join", async (data, callback) => {
        try {
            const { groupCallId } = data;

            await joinGroupCall({
                groupCallId,
                userId: socket.userId
            });

            socket.join(`groupcall_${groupCallId}`);

            io.to(`groupcall_${groupCallId}`).emit("group_call_user_joined", {
                groupCallId,
                userId: socket.userId
            });

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Leave group call
    socket.on("group_call_leave", async (data, callback) => {
        try {
            const { groupCallId } = data;

            await leaveGroupCall({
                groupCallId,
                userId: socket.userId
            });

            socket.leave(`groupcall_${groupCallId}`);

            io.to(`groupcall_${groupCallId}`).emit("group_call_user_left", {
                groupCallId,
                userId: socket.userId
            });

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // End group call
    socket.on("group_call_end", async (data, callback) => {
        try {
            const { groupCallId } = data;

            await validateGroupCallAdmin({
                groupCallId,
                userId: socket.userId
            });

            const call = await endGroupCall({
                groupCallId
            });

            const message = await saveGroupCallLog({
                groupId: call.groupId,
                groupCallId: call._id,
                senderId: socket.userId,
                type: call.type,
                duration: call.duration,
                status: "ended"
            });

            io.to(call.groupId.toString()).emit(
                "receiveGroupMessage",
                message
            );

            io.to(`groupcall_${groupCallId}`).emit("group_call_ended", {
                groupCallId,
                duration: call.duration
            });

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Lock meeting
    socket.on("group_call_lock", async (data, callback) => {
        try {
            const { groupCallId } = data;

            await validateGroupCallAdmin({
                groupCallId,
                userId: socket.userId
            });

            await lockGroupCall({ groupCallId });

            io.to(`groupcall_${groupCallId}`).emit("group_call_locked");

            callback?.({ success: true });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Unlock meeting
    socket.on("group_call_unlock", async (data, callback) => {
        try {
            const { groupCallId } = data;

            await validateGroupCallAdmin({
                groupCallId,
                userId: socket.userId
            });

            await unlockGroupCall({ groupCallId });

            io.to(`groupcall_${groupCallId}`).emit("group_call_unlocked");

            callback?.({ success: true });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Mute participant
    socket.on("group_call_mute_user", async (data, callback) => {
        try {
            const {groupCallId, targetUserId} = data;

            await validateGroupCallAdmin({
                groupCallId,
                userId: socket.userId
            });

            await muteParticipant({
                groupCallId,
                targetUserId
            });

            io.to(targetUserId).emit(
                "group_call_muted",
                {
                    groupCallId
                }
            );

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Unmute
    socket.on("group_call_unmute_self", async (data, callback) => {
        try {
            const { groupCallId } = data;

            await unmuteSelf({
                groupCallId,
                userId: socket.userId
            });

            io.to(`groupcall_${groupCallId}`).emit("group_call_user_unmuted", {
                groupCallId,
                userId: socket.userId
            });

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Add participant
    socket.on("group_call_add_participant", async (data, callback) => {
        try {
            const {
                groupCallId,
                targetUserId
            } = data;

            await validateGroupCallAdmin({
                groupCallId,
                userId: socket.userId
            });

            await addParticipantToCall({
                groupCallId,
                targetUserId
            });

            io.to(targetUserId).emit("group_call_invitation", {
                groupCallId,
                invitedBy: socket.userId,
                isMidCallInvite: true
            });

            io.to(`groupcall_${groupCallId}`).emit("group_call_participant_added", {
                groupCallId,
                targetUserId
            });

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Remove participant
    socket.on("group_call_remove_user", async (data, callback) => {
        try {
            const {groupCallId, targetUserId} = data;

            await validateGroupCallAdmin({
                groupCallId,
                userId: socket.userId
            });

            await removeParticipant({
                groupCallId,
                targetUserId
            });

            io.to(`groupcall_${groupCallId}`).emit("group_call_user_removed", {
                groupCallId,
                targetUserId
            });

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // WEBRTC offer
    socket.on("group_webrtc_offer", async (data, callback) => {
        try {
            const {
                groupCallId,
                targetUserId,
                offer
            } = data;

            const call = await GroupCall.findById(groupCallId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Group call not found"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Not part of this call"
                });
            }

            const targetParticipant = call.participants.find(
                p =>
                    p.user.toString() === targetUserId &&
                    !p.leftAt
            );

            if (!targetParticipant) {
                return callback?.({
                    success: false,
                    message: "Participant not found"
                });
            }

            io.to(targetUserId).emit(
                "group_webrtc_offer",
                {
                    groupCallId,
                    fromUserId: socket.userId,
                    offer
                }
            );

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // WEBRTC answer
    socket.on("group_webrtc_answer", async (data, callback) => {
        try {
            const {
                groupCallId,
                targetUserId,
                answer
            } = data;

            const call = await GroupCall.findById(groupCallId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Group call not found"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Not part of this call"
                });
            }

            const targetParticipant = call.participants.find(
                p =>
                    p.user.toString() === targetUserId &&
                    !p.leftAt
            );

            if (!targetParticipant) {
                return callback?.({
                    success: false,
                    message: "Participant not found"
                });
            }

            io.to(targetUserId).emit(
                "group_webrtc_answer",
                {
                    groupCallId,
                    fromUserId: socket.userId,
                    answer
                }
            );

            callback?.({
                success: true
            });

        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    //Ice candidate
    socket.on("group_ice_candidate", async (data, callback) => {
        try {
            const {
                groupCallId,
                targetUserId,
                candidate
            } = data;

            const call = await GroupCall.findById(groupCallId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Group call not found"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Not part of this call"
                });
            }

            const targetParticipant = call.participants.find(
                p =>
                    p.user.toString() === targetUserId &&
                    !p.leftAt
            );

            if (!targetParticipant) {
                return callback?.({
                    success: false,
                    message: "Participant not found"
                });
            }

            io.to(targetUserId).emit(
                "group_ice_candidate",
                {
                    groupCallId,
                    fromUserId: socket.userId,
                    candidate
                }
            );

            callback?.({
                success: true
            });

        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Active speaker
    socket.on("group_call_active_speaker", async (data, callback) => {
        try {
            const {groupCallId} = data;
            const call = await GroupCall.findById(groupCallId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Group call not found"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Not part of call"
                });
            }

            io.to(`groupcall_${groupCallId}`).emit(
                "group_call_active_speaker",
                {
                    groupCallId,
                    userId: socket.userId
                }
            );

            callback?.({
                success: true
            });

        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Pin participant
    socket.on("group_call_pin_participant", async (data, callback) => {
        try {
            const {groupCallId, targetUserId} = data;

            await validateGroupCallAdmin({
                groupCallId,
                userId: socket.userId
            });

            await pinParticipant({
                groupCallId,
                targetUserId
            });

            io.to(`groupcall_${groupCallId}`).emit(
                "group_call_participant_pinned",
                {
                    groupCallId,
                    targetUserId,
                    pinnedBy: socket.userId
                }
            );

            callback?.({
                success: true
            });

        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Unpin participant
    socket.on("group_call_unpin_participant", async (data, callback) => {
        try {
            const {
                groupCallId,
                targetUserId
            } = data;

            await validateGroupCallAdmin({
                groupCallId,
                userId: socket.userId
            });

            io.to(`groupcall_${groupCallId}`).emit(
                "group_call_participant_unpinned",
                {
                    groupCallId,
                    targetUserId,
                    unpinnedBy: socket.userId
                }
            )

            callback?.({
                success: true
            });

        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Start screen sharing
    socket.on("group_screen_share_start", async (data, callback) => {
        try {
            const { groupCallId } = data;

            await startScreenShare({
                groupCallId,
                userId: socket.userId
            });

            io.to(`groupcall_${groupCallId}`).emit(
                "group_screen_share_started",
                {
                    groupCallId,
                    userId: socket.userId
                }
            );

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Stop screen sharing
    socket.on("group_screen_share_stop", async (data, callback) => {
        try {
            const { groupCallId } = data;

            await stopScreenShare({
                groupCallId,
                userId: socket.userId
            });

            io.to(`groupcall_${groupCallId}`).emit(
                "group_screen_share_stopped",
                {
                    groupCallId,
                    userId: socket.userId
                }
            );

            callback?.({
                success: true
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Hold group call
    socket.on("group_call_hold", async (data, callback) => {
        try {
            const { groupCallId } = data;

            const call = await holdGroupCall({
                groupCallId,
                userId: socket.userId
            });

            io.to(`groupcall_${groupCallId}`).emit("group_call_hold", {
                groupCallId,
                userId: socket.userId
            });

            callback?.({
                success: true,
                message: "Group call placed on hold"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Resume group call
    socket.on("group_call_resume", async (data, callback) => {
        try {
            const { groupCallId } = data;

            const call = await resumeGroupCall({
                groupCallId,
                userId: socket.userId
            });

            io.to(`groupcall_${groupCallId}`).emit("group_call_resume", {
                groupCallId,
                userId: socket.userId
            });

            callback?.({
                success: true,
                message: "Group call resumed"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });
};

export default registerGroupCallHandlers;
