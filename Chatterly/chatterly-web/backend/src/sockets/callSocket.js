import Call from "../models/CallLog.js";
import {
    startCall,
    saveCallLog,
    holdCall,
    resumeCall,
    addParticipantToCall,
    joinConferenceCall,
    startScreenShare,
    stopScreenShare
} from "../services/callService.js";
import mongoose from "mongoose";
import User from "../models/User.js";
import admin from "../config/firebase.js";

const getCallRoom = (callId) => `call_${callId}`;

const joinCallRoom = (socket, callId) => {
    socket.join(getCallRoom(callId));
};

const leaveCallRoom = (socket, callId) => {
    socket.leave(getCallRoom(callId));
};

const registerCallHandlers = (io, socket) => {
    // START CALL
    socket.on("call_initiate", async (data, callback) => {
        try {
            console.log("CALL INITIATE HIT");
            const {
                receiverId,
                type = "audio"
            } = data;

            if (!receiverId) {
                return callback?.({
                    success: false,
                    message: "receiverId is required"
                });
            }

            // Notify receiver
            const caller = await User.findById(socket.userId)
                .select("name profilePic blockedUsers");

            const receiver = await User.findById(receiverId)
                .select("fcmToken blockedUsers");

            if (!caller || !receiver) {
                return callback?.({
                    success: false,
                    message: "User not found"
                });
            }

            // Block check
            if (
                caller.blockedUsers.some(
                    id => id.toString() === receiverId
                ) ||
                receiver.blockedUsers.some(
                    id => id.toString() === socket.userId
                )
            ) {
                return callback?.({
                    success: false,
                    message: "Cannot call blocked user"
                });
            }

            const {
                call,
                chat,
                isReceiverOnline
            } = await startCall({
                callerId: socket.userId,
                receiverId,
                type
            });

            if (!isReceiverOnline) {
                // Caller sees Outgoing - Not Answered
                const callerMessage = await saveCallLog({
                    chatId: chat._id,
                    senderId: socket.userId,
                    receiverId,
                    status: "not_answered",
                    type
                });

                // Receiver sees Missed Call
                const receiverMessage = await saveCallLog({
                    chatId: chat._id,
                    senderId: receiverId,
                    receiverId: socket.userId,
                    status: "missed",
                    type
                });

                io.to(socket.userId).emit(
                    "receiveMessage",
                    callerMessage
                );

                io.to(receiverId).emit(
                    "receiveMessage",
                    receiverMessage
                );

                return callback?.({
                    success: false,
                    message: "User is offline",
                    callId: call._id,
                    chatId: chat._id
                });
            }

            if (receiver?.fcmToken) {
                try {
                    console.log("Receiver FCM:", receiver?.fcmToken);
                    await admin.messaging().send({
                        token: receiver.fcmToken,
                        notification: {
                            title: caller?.name || "Incoming Call",
                            body: `${type} call`
                        },
                        data: {
                            type: "incoming_call",
                            callId: call._id.toString(),
                            callerId: socket.userId.toString(),
                            receiverId: receiverId.toString(),
                            chatId: chat._id.toString(),
                            callType: type
                        }
                    });
                }
                catch (error) {
                    console.log(
                        "FCM Call Notification Error:",
                        error.message
                    );
                }
            }

            io.to(receiverId).emit("call_incoming", {
                callId: call._id,
                chatId: chat._id,
                callerId: socket.userId,
                callerName: caller.name,
                callerProfilePic: caller.profilePic,
                receiverId,
                type,
                status: "calling",
                createdAt: call.createdAt
            });

            // Notify caller
            socket.emit("call_status", {
                callId: call._id,
                chatId: chat._id,
                status: "ringing"
            });

            // Auto missed call after 30 seconds
            setTimeout(async () => {
                const latestCall = await Call.findById(call._id);

                if (
                    latestCall &&
                    latestCall.status === "calling"
                ) {
                    latestCall.status = "missed";
                    latestCall.endedAt = new Date();

                    await latestCall.save();

                    const receiver = await User.findById(latestCall.receiver)
                        .select("fcmToken");

                    if (receiver?.fcmToken) {
                        try {
                            await admin.messaging().send({
                                token: receiver.fcmToken,
                                notification: {
                                    title: "Missed Call",
                                    body: `${caller?.name || "Someone"} tried to call you`
                                },
                                data: {
                                    type: "missed_call",
                                    callId: latestCall._id.toString(),
                                    callerId: latestCall.caller.toString()
                                }
                            });
                        }
                        catch (error) {
                            console.log(
                                "Missed Call FCM Error:",
                                error.message
                            );
                        }
                    }

                    // Caller sees "Outgoing - Not Answered"
                    const callerMessage = await saveCallLog({
                        chatId: call.chat,
                        senderId: call.caller,
                        receiverId: call.receiver,
                        status: "not_answered",
                        type: call.type
                    });

                    // Receiver sees "Missed Call"
                    const receiverMessage = await saveCallLog({
                        chatId: call.chat,
                        senderId: call.receiver,
                        receiverId: call.caller,
                        status: "missed",
                        type: call.type
                    });

                    io.to(call.caller.toString()).emit(
                        "receiveMessage",
                        callerMessage
                    );

                    io.to(call.receiver.toString()).emit(
                        "receiveMessage",
                        receiverMessage
                    );
                    
                    io.to(latestCall.caller.toString()).emit("call_missed");
                    
                    io.to(latestCall.receiver.toString()).emit("call_missed");
                }
            }, 30000);

            callback?.({
                success: true,
                message: "Call initiated successfully",
                callId: call._id,
                chatId: chat._id
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // ACCEPT CALL
    socket.on("call_accept", async (data, callback) => {
        try {
            const { callId } = data;

            if (!mongoose.Types.ObjectId.isValid(callId)) {
                return callback?.({
                    success: false,
                    message: "Invalid callId"
                });
            }

            const call = await Call.findById(callId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Call not found"
                });
            }

            // Only receiver can accept
            if (call.receiver.toString() !== socket.userId) {
                return callback?.({
                    success: false,
                    message: "Only receiver can accept the call"
                });
            }

            if (call.status !== "calling") {
                return callback?.({
                    success: false,
                    message: `Cannot accept a ${call.status} call`
                });
            }

            call.status = "connected";
            call.startedAt = new Date();

            await call.save();

            joinCallRoom(socket, call._id);

            io.to(call.caller.toString()).emit("call_connected", {
                callId: call._id,
                status: "connected",
                startedAt: call.startedAt
            });

            io.to(call.receiver.toString()).emit("call_connected", {
                callId: call._id,
                status: "connected",
                startedAt: call.startedAt
            });

            callback?.({
                success: true,
                message: "Call accepted"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Join call room
    socket.on("call_join_room", async (data, callback) => {
        try {
            const { callId } = data;

            const call = await Call.findById(callId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Call not found"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId && !p.leftAt
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "You are not a participant in this call"
                });
            }

            joinCallRoom(socket, callId);

            callback?.({
                success: true,
                message: "Joined call room"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Mute
    socket.on("call_mute", async (data,callback) => {
        try{
            const {callId} = data;
            const call = await Call.findById(callId);

            if (!call || call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call not active"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "call_muted",
                    {
                        callId,
                        userId: socket.userId
                    }
                );
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

    // Unmute
    socket.on("call_unmute", async (data, callback) => {
        try {
            const { callId } = data;
            const call = await Call.findById(callId);

            if (!call || call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call not active"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "call_unmuted",
                    {
                        callId,
                        userId: socket.userId
                    }
                );
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

    // HOLD CALL
    socket.on("call_hold", async (data, callback) => {
        try {
            const {callId} = data;

            const call = await holdCall({
                callId,
                userId: socket.userId
            });

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId
            );

            io.to(getCallRoom(callId)).emit("call_hold", {
                callId,
                userId: socket.userId,
                isOnHold: participant.isOnHold
            });

            callback?.({
                success: true,
                message: "Call placed on hold"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // RESUME CALL
    socket.on("call_resume", async (data, callback) => {
        try {
            const { callId } = data;

            const call = await resumeCall({
                callId,
                userId: socket.userId
            });

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId
            );

            io.to(getCallRoom(callId)).emit("call_resume", {
                callId,
                userId: socket.userId,
                isOnHold: participant.isOnHold
            });

            callback?.({
                success: true,
                message: "Call resumed"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // START SCREEN SHARE
    socket.on("call_screen_share_start", async (data, callback) => {
        try {
            const { callId } = data;

            await startScreenShare({
                callId,
                userId: socket.userId
            });

            io.to(getCallRoom(callId)).emit(
                "call_screen_share_started",
                {
                    callId,
                    userId: socket.userId
                }
            );

            callback?.({
                success: true,
                message: "Screen sharing started"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // STOP SCREEN SHARE
    socket.on("call_screen_share_stop", async (data, callback) => {
        try {
            const { callId } = data;

            await stopScreenShare({
                callId,
                userId: socket.userId
            });

            io.to(getCallRoom(callId)).emit(
                "call_screen_share_stopped",
                {
                    callId,
                    userId: socket.userId
                }
            );

            callback?.({
                success: true,
                message: "Screen sharing stopped"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Add participant to conference call
    socket.on("call_add_participant", async (data, callback) => {
        try {
            const {
                callId,
                targetUserId
            } = data;

            const activeCall = await Call.findOne({
                participants: {
                    $elemMatch: {
                        user: targetUserId,
                        leftAt: null
                    }
                },
                status: "connected"
            });

            if (activeCall) {
                return callback?.({
                    success: false,
                    message: "User is already in another active call"
                });
            }

            await addParticipantToCall({
                callId,
                targetUserId
            });

            // Notify the newly added participant
            io.to(targetUserId).emit(
                "conference_call_invite",
                {
                    callId,
                    invitedBy: socket.userId
                }
            );

            callback?.({
                success: true,
                message: "Conference invitation sent"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Join conference call
    socket.on("call_join_conference", async (data, callback) => {
        try {
            const { callId } = data;

            const call = await joinConferenceCall({
                callId,
                userId: socket.userId
            });

            // Join socket room
            joinCallRoom(socket, callId);

            // Notify everyone in the conference
            call.participants
                .filter(p => !p.leftAt)
                .forEach((participant) => {
                    io.to(participant.user.toString()).emit(
                        "participant_joined",
                    {
                        callId,
                        participant: socket.userId
                    }
                );
            });

            callback?.({
                success: true,
                message: "Joined conference call"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // SPEAKER ON
    socket.on("speaker_on", async (data, callback) => {
        try {
            const { callId } = data;
            const call = await Call.findById(callId);

            if (!call || call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call not active"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "speaker_on",
                    {
                        callId,
                        userId: socket.userId
                    }
                );
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

    // SPEAKER OFF
    socket.on("speaker_off", async (data, callback) => {
        try {
            const { callId } = data;
            const call = await Call.findById(callId);

            if (!call || call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call not active"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "speaker_off",
                    {
                        callId,
                        userId: socket.userId
                    }
                );
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

    // WEBRTC
    socket.on("webrtc_offer", async (data, callback) => {
        try {
            const {callId, offer} = data;
            const call = await Call.findById(callId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Call not found"
                });
            }

            if (call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call is not connected"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId && !p.leftAt
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Unauthorized"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "webrtc_offer",
                    {
                        callId,
                        offer,
                        from: socket.userId
                    }
                );
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

    // WEBRTC ANSWER
    socket.on("webrtc_answer", async (data, callback) => {
        try {
            const {callId, answer} = data;
            const call = await Call.findById(callId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Call not found"
                });
            }

            if (call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call is not connected"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId && !p.leftAt
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Unauthorized"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "webrtc_answer",
                    {
                        callId,
                        answer,
                        from: socket.userId
                    }
                );
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

    // ICE CANDIDATE
    socket.on("ice_candidate", async (data, callback) => {
        try {
            const {callId, candidate} = data;
            const call = await Call.findById(callId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Call not found"
                });
            }

            if (call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call is not connected"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId && !p.leftAt
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Unauthorized"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "ice_candidate",
                    {
                        callId,
                        candidate,
                        from: socket.userId
                    }
                );
            });

            callback?.({
                success: true,
                message: "ICE candidate forwarded"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // REJECT CALL
    socket.on("call_reject", async (data, callback) => {
        try {
            const { callId } = data;

            if (!mongoose.Types.ObjectId.isValid(callId)) {
                return callback?.({
                    success: false,
                    message: "Invalid callId"
                });
            }

            const call = await Call.findById(callId);
            
            if (!call) {
                return callback?.({
                    success: false,
                    message: "Call not found"
                });
            }

            // Only receiver can reject
            if (call.receiver.toString() !== socket.userId) {
                return callback?.({
                    success: false,
                    message: "Only receiver can reject the call"
                });
            }

            if (call.status !== "calling") {
                return callback?.({
                    success: false,
                    message: `Cannot reject a ${call.status} call`
                });
            }

            call.status = "rejected";
            call.endedAt = new Date();

            await call.save();

            io.to(call.caller.toString()).emit("call_rejected", {
                callId: call._id,
                status: "rejected",
                rejectedBy: call.receiver
            });

            io.to(call.receiver.toString()).emit("call_rejected", {
                callId: call._id,
                status: "rejected",
                rejectedBy: call.receiver
            });

            const message = await saveCallLog({
                chatId: call.chat,
                senderId: call.caller,
                receiverId: call.receiver,
                callId: call._id,
                status: "rejected",
                type: call.type
            });

            const roomId = [
                String(call.caller),
                String(call.receiver)
            ].sort().join("_");

            io.to(roomId).emit("receiveMessage", message);

            callback?.({
                success: true,
                message: "Call rejected"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // END CALL
    socket.on("call_end", async (data, callback) => {
        try {
            const { callId } = data;

            if (!mongoose.Types.ObjectId.isValid(callId)) {
                return callback?.({
                    success: false,
                    message: "Invalid callId"
                });
            }

            const call = await Call.findById(callId);
            
            if (!call) {
                return callback?.({
                    success: false,
                    message: "Call not found"
                });
            }

            const participant = call.participants.find(
                p => p.user.toString() === socket.userId && !p.leftAt
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    message: "Unauthorized"
                });
            }

            if (call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call is not active"
                });
            }

            const endTime = new Date();
            const duration = call.startedAt? Math.floor(
                (endTime.getTime() - call.startedAt.getTime()) / 1000
            ): 0;

            const isConferenceCall = call.participants.length > 2;

            if (isConferenceCall) {
                participant.leftAt = endTime;
            }
            else {
                call.participants.forEach((p) => {
                    if (!p.leftAt) {
                        p.leftAt = endTime;
                    }
                });
            }

            leaveCallRoom(socket, callId);

            const activeParticipants = call.participants.filter(
                p => !p.leftAt
            );

            const roomId = [
                String(call.caller),
                String(call.receiver)
            ].sort().join("_");

            if (activeParticipants.length === 0) {
                call.status = "completed";
                call.endedAt = endTime;
                call.duration = duration;
                call.isScreenSharing = false;
                call.screenSharingUser = null;

                const message = await saveCallLog({
                    chatId: call.chat,
                    senderId: call.caller,
                    receiverId: call.receiver,
                    callId: call._id,
                    status: "completed",
                    type: call.type,
                    duration
                });

                io.to(roomId).emit("receiveMessage", message);

                if (isConferenceCall) {
                    io.to(getCallRoom(callId)).emit(
                        "call_ended",
                        {
                            callId,
                            duration,
                            endedBy: socket.userId
                        }
                    );
                }
                else {
                    io.to(call.caller.toString()).emit(
                        "call_ended",
                        {
                            callId,
                            duration,
                            endedBy: socket.userId
                        }
                    );

                    io.to(call.receiver.toString()).emit(
                        "call_ended",
                        {
                            callId,
                            duration,
                            endedBy: socket.userId
                        }
                    );
                }
            }

            await call.save();

            if (
                isConferenceCall &&
                activeParticipants.length > 0
            ) {
                io.to(getCallRoom(callId)).emit(
                    "participant_left",
                    {
                        callId,
                        userId: socket.userId,
                        participantsCount: activeParticipants.length
                    }
                );
            }

            callback?.({
                success: true,
                message: "Call ended"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // CANCEL CALL (Caller only)
    socket.on("call_cancel", async (data, callback) => {
        try {
            const { callId } = data;

            if (!mongoose.Types.ObjectId.isValid(callId)) {
                return callback?.({
                    success: false,
                    message: "Invalid callId"
                });
            }

            const call = await Call.findById(callId);

            if (!call) {
                return callback?.({
                    success: false,
                    message: "Call not found"
                });
            }

            // Only caller can cancel
            if (call.caller.toString() !== socket.userId) {
                return callback?.({
                    success: false,
                    message: "Only caller can cancel the call"
                });
            }

            // Can cancel only while ringing
            if (call.status !== "calling") {
                return callback?.({
                    success: false,
                    message: `Cannot cancel a ${call.status} call`
                });
            }

            call.status = "cancelled";
            call.endedAt = new Date();

            await call.save();

            io.to(call.caller.toString()).emit("call_cancelled", {
                callId: call._id,
                status: "cancelled"
            });

            io.to(call.receiver.toString()).emit("call_cancelled", {
                callId: call._id,
                status: "cancelled"
            });

            const message = await saveCallLog({
                chatId: call.chat,
                senderId: call.caller,
                receiverId: call.receiver,
                callId: call._id,
                status: "cancelled",
                type: call.type
            });

            const roomId = [
                String(call.caller),
                String(call.receiver)
            ].sort().join("_");

            io.to(roomId).emit("receiveMessage", message);

            callback?.({
                success: true,
                message: "Call cancelled"
            });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });

    // Camer OFF
    socket.on("camera_off", async (data, callback) => {
        try {
            const { callId } = data;
            const call = await Call.findById(callId);

            if (!call || call.status !== "connected") {
                return callback?.({
                    success:false,
                    message:"Call not active"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "camera_off",
                    {
                        callId,
                        userId: socket.userId
                    }
                );
            });

            callback?.({ success:true });
        }
        catch(error){
            callback?.({
                success:false,
                message:error.message
            });
        }
    });

    // Camera ON
    socket.on("camera_on", async (data, callback) => {
        try {
            const { callId } = data;
            const call = await Call.findById(callId);

            if (!call || call.status !== "connected") {
                return callback?.({
                    success:false,
                    message:"Call not active"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "camera_on",
                    {
                        callId,
                        userId: socket.userId
                    }
                );
            });

            callback?.({ success:true });
        }
        catch(error){
            callback?.({
                success:false,
                message:error.message
            });
        }
    });

    // Camera switch
    socket.on("camera_switch", async (data, callback) => {
        try {
            const { callId, camera } = data;
            const call = await Call.findById(callId);

            if (!call || call.status !== "connected") {
                return callback?.({
                    success:false,
                    message:"Call not active"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "camera_switch",
                    {
                        callId,
                        userId: socket.userId,
                        camera
                    }
                );
            });

            callback?.({ success:true });
        }
        catch(error){
            callback?.({
                success:false,
                message:error.message
            });
        }
    });

    // Network quality
    socket.on("network_quality", async (data, callback) => {
        try {
            const { callId, quality } = data;
            const call = await Call.findById(callId);

            if (!call || call.status !== "connected") {
                return callback?.({
                    success: false,
                    message: "Call not active"
                });
            }

            call.participants.filter(
                p => p.user.toString() !== socket.userId && !p.leftAt
            )
            .forEach((participant) => {
                io.to(participant.user.toString()).emit(
                    "network_quality",
                    {
                        callId,
                        userId: socket.userId,
                        quality
                    }
                );
            });

            callback?.({ success: true });
        }
        catch (error) {
            callback?.({
                success: false,
                message: error.message
            });
        }
    });
};

export default registerCallHandlers;
