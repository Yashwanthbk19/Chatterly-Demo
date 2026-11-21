import {
    startCall,
    saveCallLog
} from "../services/callService.js";
import admin from "../config/firebase.js";
import User from "../models/User.js";

export const initiateCall = async (req, res, next) => {
    try {
        const callerId = req.user.id || req.user._id;
        const {
            receiverId,
            type = "audio"
        } = req.body;

        const io = req.app.get("io");

        const caller = await User.findById(callerId)
            .select("name profilePic blockedUsers");

        const receiver = await User.findById(receiverId)
            .select("fcmToken blockedUsers");

        if (!caller || !receiver) {
            return res.status(404).json({
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
                id => id.toString() === callerId
            )
        ) {
            return res.status(403).json({
                success: false,
                message: "Cannot call blocked user"
            });
        }

        const {
            call,
            chat,
            isReceiverOnline
        } = await startCall({
            callerId,
            receiverId,
            type
        });

        if (!isReceiverOnline) {
            await saveCallLog({
                chatId: chat._id,
                senderId: callerId,
                receiverId,
                status: "missed",
                type
            });

            return res.status(200).json({
                success: true,
                message: "User is offline",
                data: {
                    call,
                    chat
                }
            });
        }

        if (receiver?.fcmToken) {
            try {
                await admin.messaging().send({
                    token: receiver.fcmToken,
                    notification: {
                        title: caller?.name || "Incoming Call",
                        body: `${type} call`
                    },
                    data: {
                        type: "incoming_call",
                        callId: call._id.toString(),
                        callerId: callerId.toString(),
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
            callerId,
            callerName: caller.name,
            callerProfilePic: caller.profilePic,
            receiverId,
            type,
            status: "calling",
            createdAt: call.createdAt
        });

        io.to(callerId).emit("call_status", {
            callId: call._id,
            chatId: chat._id,
            status: "ringing"
        });

        return res.status(201).json({
            success: true,
            message: "Call initiated successfully",
            data: {
                call,
                chat
            }
        });
    }
    catch (error) {
        next(error);
    }
};
