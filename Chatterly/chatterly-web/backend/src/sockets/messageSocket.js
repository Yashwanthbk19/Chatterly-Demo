import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import redisClient from "../config/redis.js";
import deleteMediaFromS3 from "../utils/s3Delete.js";
import User from "../models/User.js"; 
import ChatSetting from "../models/ChatSetting.js";
 
const registerMessageHandlers = (io, socket) => {
    // Join chat
    socket.on("joinchat", ({ user1, user2 }) => {
        try {
            if (!user1 || !user2) return;

            const roomId = [String(user1), String(user2)].sort().join("_");
            socket.join(roomId);
            console.log(`joined room: ${roomId}`);
        }
        catch (error) {
            console.log("Join chat error:", error.message);
        }
    });

    // Send message
    socket.on("sendMessage", async (data, callback) => {
        try{
            const {
                sender,
                receiver,
                encryptedContent,
                replyTo,
                tempId,
                mediaUrl,
                mediaType,
                caption,
                audioDuration,
                waveform
            } = data;

            // Validation
            if (!sender || !receiver) {
                return callback?.({
                    success: false,
                    tempId,
                    error: "Sender and receiver required",
                });
            }
            // check Block status
            const senderUser = await User.findById(sender);
            const receiverUser = await User.findById(receiver);
            
            if(!senderUser || !receiverUser) {
                return callback?.({
                    success: false,
                    error: "User not found"
                });
            }

            // Sender blocked receiver
            if (senderUser.blockedUsers?.some(id => id.toString() === receiver)) {
                return callback?.({
                    success: false,
                    error: "You have blocked this user"
                });
            }

            // Receiver blocked sender
            if (senderUser.blockedBy?.some(id => id.toString() === receiver)) {
                return callback?.({
                    success: false,
                    error: "You are blocked by this user"
                });
            }
    
            const hasText = !!encryptedContent;
            const hasMedia = !!mediaUrl;

            if (!hasText && !hasMedia) {
                return callback?.({
                    success: false,
                    tempId,
                    error: "Empty message",
                });
            }

            // find or create chat
            let chat = await Chat.findOne({
                "participants.user": { $all: [sender, receiver] }
            });

            if (!chat) {
                chat = await Chat.create({
                    participants: [
                        { user: sender },
                        { user: receiver }
                    ]
                });
            }

            let newMessage;

            try {
                let replyPreview = null

                if (replyTo) {
                    const originalMessage = await Message.findById(replyTo);

                    if (!originalMessage) {
                        return callback?.({
                            success: false,
                            tempId,
                            error: "Reply message not found"
                        });
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
                        { sender: sender, receiver: receiver },
                        { sender: receiver, receiver: sender }
                    ]
                });

                let expiresAt = null;

                switch (setting?.disappearingTimer) {
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

                // new message
                newMessage = await Message.create({
                    sender,
                    receiver,
                    content: "",
                    encryptedContent,
                    replyTo,
                    replyPreview,
                    chatId: chat._id,
                    tempId,
                    mediaUrl,
                    messageType: mediaType || "text",
                    mediaType,
                    caption,
                    audioDuration,
                    waveform,
                    status: "sent",
                    disappearAfter:
                             setting?.disappearingTimer || "off",
                    expiresAt
                });
            }
            catch (err) {
                // DUPLICATE CASE
                if (err.code === 11000 && tempId) {
                    const existing = await Message.findOne({ tempId });

                    if (existing) {
                        return callback?.({
                            success: true,
                            duplicate: true,
                            tempId,
                            messageId: existing._id,
                            status: existing.status
                        });
                    }
                }
                throw err;
            }

            // Populate
            await newMessage.populate([
                {
                    path: "sender",
                    select: "name profilePic"
                },
                {
                    path: "replyTo",
                    select: "encryptedContent sender messageType mediaUrl"
                },
                {
                    path: "replyPreview.sender",
                    select: "name profilePic"
                }
            ]);

            // ACK
            callback?.({
                success: true,
                tempId,
                messageId: newMessage._id,
                status: "sent"
            });

            // Backgrount task
            (async () => {
                try {
                    // update last message
                    chat.lastMessage = newMessage._id;
                    await chat.save();

                    // Check via redis
                    const isReceiverOnline = await redisClient.sIsMember(
                        "online_users",
                        receiver.toString()
                    );
    
                    // update delivery
                    if (isReceiverOnline) {
                        await Message.findByIdAndUpdate(newMessage._id, {
                            status: "delivered",
                            deliveredAt: new Date()
                        });

                        newMessage.status = "delivered";
                        newMessage.deliveredAt = new Date();
                    }

                    // Publish realtime message
                    const roomId = [
                        String(sender),
                        String(receiver)
                    ]
                    .sort()
                    .join("_");

                    io.to(roomId).emit("receiveMessage", newMessage);

                    // Notify sender delivered
                    if (isReceiverOnline) {
                        io.to(sender.toString()).emit("message_delivered", {
                            messageId: newMessage._id
                        });
                    }
                }
                catch (bgError) {
                    console.log("Background task error:", bgError.message);
                }
            }) (); 
        } 
        catch (error) {
            console.log("Send message error:", error.message);

            callback?.({
                success: false,
                error: error.message,
            });

            socket.emit(
                "message_failed", {
                    error: error.message
                }
            );
        }
    });

    // Forward message
    socket.on("forwardMessage", async (data,callback) => {
        try{
            const {
                originalMessageId,
                sender,
                receiver,
                tempId
            } = data;

            // Validation
            if (!originalMessageId || !sender || !receiver) {
                return callback?.({
                    success: false,
                    error: "Missing required fields"
                });
            }

            // Check block status
            const senderUser = await User.findById(sender);
            const receiverUser = await User.findById(receiver);

            if (!senderUser || !receiverUser) {
                return callback?.({
                    success: false,
                    error: "User not found"
                });
            }

            if (
                senderUser.blockedUsers.some(
                    id => id.toString() === receiver
                )
            ) {
                return callback?.({
                    success: false,
                    error: "You have blocked this user"
                });
            }

            if (
                senderUser.blockedBy.some(
                    id => id.toString() === receiver
                )
            ) {
                return callback?.({
                    success: false,
                    error: "You are blocked by this user"
                });
            }

            // Find original
            const originalMessage = await Message.findById(originalMessageId);

            if (!originalMessage) {
                return callback?.({
                    success: false,
                    error: "Original message not found"
                });
            }

            // Find or create chat
            let chat = await Chat.findOne({
                "participants.user": {$all: [sender, receiver]}
            });

            if (!chat) {
                chat = await Chat.create({
                    participants: [
                        {user: sender},
                        {user: receiver}
                    ]
                });
            }

            // Create forward message
            const forwardedMessage = await Message.create({
                sender,
                receiver,
                chatId: chat._id,
                content: "",
                encryptedContent: originalMessage.encryptedContent,
                messageType: originalMessage.messageType,
                mediaType: originalMessage.mediaType,
                mediaUrl: originalMessage.mediaUrl,
                thumbnailUrl: originalMessage.thumbnailUrl,
                caption: originalMessage.caption,
                audioDuration: originalMessage.audioDuration,
                waveform: originalMessage.waveform,
                fileName: originalMessage.fileName,
                filePath: originalMessage.filePath,
                fileType: originalMessage.fileType,
                fileSize: originalMessage.fileSize,
                isForwarded: true,
                forwardedFrom: originalMessage.sender,
                tempId,
                status: "sent"
            });

            // Populate
            await forwardedMessage.populate([
                {
                    path: "sender",
                    select: "name profilePic"
                },
                {
                    path: "forwardedFrom",
                    select: "name profilePic"
                }
            ]);

            // Update chat
            chat.lastMessage = forwardedMessage._id;
            await chat.save();

            // Room
            const roomId = [
                String(sender),
                String(receiver)
            ].sort().join("_");

            // Realtime
            io.to(roomId).emit("receiveMessage", forwardedMessage);

            // Callback
            callback?.({
                success: true,
                messageId: forwardedMessage._id
            });
        }
        catch (error) {
            console.log("Forwarded message error:", error.message);

            callback?.({
                success: false,
                error: error.message
            });
        }
    });
 
    // Typing indicator
    socket.on("typing", ({ sender, receiver }) => {
        try {
            const roomId = [String(sender), String(receiver)].sort().join("_");
 
            socket.to(roomId).emit("userTyping", { sender });
        }
        catch (error) {
            console.log("Typing error:", error.message);
        }
    });
 
    socket.on("stopTyping", ({ sender, receiver }) => {
        try {
            const roomId = [String(sender), String(receiver)].sort().join("_");
 
            socket.to(roomId).emit("userStopTyping", { sender });
        }
        catch (error) {
            console.log("Stop typing error:", error.message);
        }
    });

    // Mark as read
    socket.on ("markAsRead", async ({chatId, userId}) => {
        try {
            const messages = await Message.find({
                chatId,
                receiver : userId,
                status : {$ne: "read"}
            });

            const messageIds = messages.map(msg => msg._id);

            // Update unread messages
            if (messages.length) {
                await Message.updateMany(
                    {
                        chatId,
                        receiver: userId,
                        status: {$ne: "read"}
                    },
                    {
                        status : "read",
                        readAt : new Date()
                    }
                );
            }
            
            // Remove manual unread mark
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

            // Notify sender
            if (messages.length) {
                const senderId = messages[0].sender;

                io.to(senderId.toString()).emit("messages_read", {
                    chatId,
                    messageIds
                });
            }
        }
        catch (error) {
            console.log("Read error: ", error.message);
        }
    });

    // Delete message
    socket.on("deleteMessageForMe", async ({ messageId, userId }) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) return;

            if (!message.deletedFor.includes(userId)) {
                message.deletedFor.push(userId);
                await message.save();
            }

            // Notify ONLY that user
            socket.emit("message_deleted", {
                messageId,
                type: "me"
            });
        } 
        catch (error) {
            console.log("Delete for me error:", error.message);
        }
    });

    // Delete message for everyone
    socket.on("deleteMessageForEveryone", async ({ messageId, userId }) => {
        try {
            const message = await Message.findById(messageId);
            if (!message) return;

            // Only sender can delete for everyone
            if (message.sender.toString() !== userId) {
                socket.emit("error", { message: "Not allowed" });
                return;
            }

            const DELETE_TIME_LIMIT = 24 * 60 * 60 * 1000;
            const now = Date.now();
            const messageTime = new Date(message.createdAt).getTime();

            if (now - messageTime > DELETE_TIME_LIMIT) {
                socket.emit("error", {message: "Delete time limit reached"});
                
                return;
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
            message.mediaUrl = "";
            message.thumbnailUrl = "";
            message.filePath = "";
            message.fileName = "";
            message.fileType = "";

            await message.save();

            const roomId = [String(message.sender), String(message.receiver)]
            .sort().join("_");

            // Notify BOTH users
            io.to(roomId).emit("message_deleted", {
                messageId,
                type: "everyone"
            });
        }
        catch (error) {
            console.log("Delete for everyone error:", error.message);
        }
    });

    // Delete chat for me
    socket.on("deleteChatForMe", async ({ chatId, userId }) => {
        try {
            if (!chatId || !userId) return;

            const chat = await Chat.findOneAndUpdate(
                {
                    _id: chatId,
                    "participants.user": userId
                },
                {
                    $set: {"participants.$.archived": true}
                },
                { new: true }
            );

            if (!chat) {
                socket.emit("error", { message: "Chat not found" });
                return;
            }

            // Notify ONLY this user
            socket.emit("chat_deleted", {chatId});
        }
        catch (error) {
            console.log("Delete chat error:", error.message);
        }
    });

    // Pin message
    socket.on("pinMessage", async ({messageId, userId}) => {
        try{
            const message = await Message.findById(messageId);

            if (!message) {
                return socket.emit("error", {message: "Message not found"});
            }

            message.isPinned = true;
            message.pinnedBy = userId;
            message.pinnedAt = new Date();

            await message.save();

            const roomId = [
                String(message.sender),
                String(message.receiver)
            ].sort().join("_");

            io.to(roomId).emit("message_pinned", {
                messageId,
                pinnedBy: userId,
                pinnedAt: message.pinnedAt
            });
        }
        catch (error) {
            console.log("Pin message error:", error.message);
        }
    });

    // Unpin message
    socket.on("unpinMessage", async ({messageId}) => {
        try{
            const message = await Message.findById(messageId);
            
            if (!message) return;

            message.isPinned = false;
            message.pinnedBy = null;
            message.pinnedAt = null;

            await message.save();

            const roomId = [
                String(message.sender),
                String(message.receiver)
            ].sort().join("_");

            io.to(roomId).emit("message_unpinned", {messageId});
        }
        catch (error) {
            console.log("Unpin error:", error.message);
        }
    });

    // Mark unread
    socket.on("markChatUnread", async ({chatId, userId}) => {
        try{
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
                {new: true}
            );

            if (!chat) return;

            socket.emit("chat_marked_unread", {chatId});
        }
        catch (error) {
            console.log("Mark unread error:", error.message);
        }
    });
};

export default registerMessageHandlers;
