import Group from "../models/Group.js";
import Message from "../models/Message.js";
import deleteMediaFromS3 from "../utils/s3Delete.js";
import crypto from "crypto";

const registerGroupHandlers = (io, socket) => {
    // JOIN GROUP
    socket.on("joinGroup", ({ groupId }) => {
        try {
            if (!groupId) return;

            socket.join(groupId.toString());

            console.log(`Joined group: ${groupId}`);

        }
        catch (error) {
            console.log("Join group error:", error.message);
        }
    });

    // LEAVE GROUP
    socket.on("leaveGroup", ({ groupId }) => {
        try {
            if (!groupId) return;

            socket.leave(groupId.toString());
            console.log(`Left group: ${groupId}`);

        }
        catch (error) {
            console.log("Leave group error:", error.message);
        }
    });

    // SEND GROUP MESSAGE
    socket.on("sendGroupMessage", async (data, callback) => {
        try {
            const {
                sender,
                groupId,
                message,
                mediaUrl,
                mediaType,
                caption,
                tempId
            } = data;

            if (!sender || !groupId) {
                return callback?.({
                    success: false,
                    error: "Sender and groupId required"
                });
            }

            const group = await Group.findById(groupId);

            if (!group) {
                return callback?.({
                    success: false,
                    error: "Group not found"
                });
            }

            const participant = group.participants.find(
                p =>
                    p.user.toString() ===
                    sender.toString()
            );

            if (!participant) {
                return callback?.({
                    success: false,
                    error: "You are not in this group anymore, so you can't message here."
                });
            }

            if (group.settings.onlyAdminsCanMessage) {
                if (
                    !["superadmin","admin"].includes(participant.role)
                ) {
                    return callback?.({
                        success:false,
                        error:"Only admins can send messages"
                    });
                }
            }

            const newMessage = await Message.create({
                sender,
                groupId,
                content: message || "",
                mediaUrl: mediaUrl || "",
                caption: caption || "",
                messageType: mediaType || "text",
                status: "sent",
                tempId: tempId || crypto.randomUUID()
            });

            await Group.findByIdAndUpdate(
                groupId,
                {
                    lastMessage: newMessage._id
                }
            );

            await newMessage.populate(
                "sender",
                "name profilePic"
            );

            io.to(groupId.toString()).emit(
                "receiveGroupMessage",
                newMessage
            );
                
            callback?.({
                success: true,
                data: newMessage
            });
        }
        catch (error) {
            console.log("Group message error:", error.message);

            callback?.({
                success: false,
                error: error.message
            });
        }
    });

    // GROUP TYPING
    socket.on("groupTyping", async ({ groupId, sender }) => {
        try {
            if (!groupId || !sender) return;

            const group = await Group.findById(groupId);

            if (!group) return;

            // CHECK WHETHER USER IS STILL A MEMBER
            const isMember = group.participants.some(
                p =>
                    p.user.toString() ===
                    sender.toString()
            );

            // Removed user cannot send typing status
            if (!isMember) {
                return;
            }

            socket.to(groupId.toString()).emit("groupTyping", { sender });
        }
        catch (error) {
            console.log("Group typing error:", error.message);
        }
    });

    // STOP GROUP TYPING
    socket.on("stopGroupTyping", async ({ groupId, sender }) => {
        try {
            if (!groupId || !sender) return;

            const group = await Group.findById(groupId);

            if (!group) return;

            // CHECK WHETHER USER IS STILL A MEMBER
            const isMember = group.participants.some(
                p =>
                    p.user.toString() ===
                    sender.toString()
            );

            // Removed user cannot send typing status
            if (!isMember) {
                return;
            }

            socket.to(groupId.toString()).emit("stopGroupTyping", { sender });
        }
        catch (error) {
            console.log("Stop group typing error:", error.message);
        }
    });

    // Delete group message
    socket.on("deleteGroupMessage", async ({ messageId, userId }) => {
        try {
            const message = await Message.findById(messageId);

            if (!message) return;

            if (
                message.sender.toString() !==
                userId.toString()
            ) {
                return;
            }

            if (message.mediaUrl) {
                await deleteMediaFromS3(message.mediaUrl);
            }

            message.isDeleted = true;
            message.content = "This message was deleted";
            message.mediaUrl = "";

            await message.save();

            io.to(message.groupId.toString())
            .emit(
                "group_message_deleted",
                {messageId}
            );
        }
        catch (error) {
            console.log("Delete group msg error:", error.message);
        }
    });

    // Pin group messages
    socket.on("pinGroupMessage", async ({ messageId, userId }) => {
        try {
            const message = await Message.findById(messageId);

            if (!message) return;

            const group = await Group.findById(
                message.groupId
            );

            const participant = group.participants.find(
                p =>
                    p.user.toString() === userId.toString()
            );

            if(
                !participant ||
                !["superadmin","admin","moderator"].includes(participant.role)
            ){
                return;
            }

            message.isPinned = true;
            message.pinnedBy = userId;
            message.pinnedAt = new Date();

            await message.save();

            io.to(message.groupId.toString())
            .emit(
                "group_message_pinned",
                {
                    messageId,
                    pinnedBy: userId,
                    pinnedAt: message.pinnedAt
                }
            );
        }
        catch (error) {
            console.log(error.message);
        }
    });

    // Unpin group messages
    socket.on("unpinGroupMessage", async ({ messageId, userId }) => {
        try {
            const message = await Message.findById(messageId);

            if (!message) return;

            const group = await Group.findById(
                message.groupId
            );

            const participant = group.participants.find(
                p =>
                    p.user.toString() === userId.toString()
            );

            if(
                !participant ||
                !["superadmin","admin","moderator"].includes(participant.role)
            ){
                return;
            }

            message.isPinned = false;
            message.pinnedBy = null;
            message.pinnedAt = null;

            await message.save();

            io.to(message.groupId.toString())
            .emit(
                "group_message_unpinned",
            {
                messageId
            });
        }
        catch (error) {
            console.log(error.message);
        }
    });

    // Read receipt
    socket.on("markGroupMessageRead", async ({
        messageId,
        userId
    }) => {
        try {
            if (!messageId || !userId) {
                return;
            }

            const message = await Message.findById(messageId);

            if (!message) return;

            // already read check
            const alreadyRead = message.readBy.some(
                r => r.user.toString() === userId.toString()
            );

            if (!alreadyRead) {
                message.readBy.push({
                    user: userId,
                    readAt: new Date()
                });
            }

            // get group
            const group = await Group.findById(message.groupId);

            if (group) {
                // only active participants except sender
                const participantIds = group.participants
                    .map(p => p.user.toString())
                    .filter(id =>
                        id !== message.sender.toString()
                    );

                // users who read
                const readUserIds = message.readBy.map(
                    r => r.user.toString()
                );

                // everyone read?
                const allRead = participantIds.every(
                    id => readUserIds.includes(id)
                );

                if (allRead) {
                    message.status = "read";
                }
                else if (readUserIds.length > 0) {
                    message.status = "delivered";
                }
            }

            await message.save();

            io.to(message.groupId.toString()).emit(
                "group_message_read",
                {
                    messageId,
                    userId,
                    status: message.status,
                    readBy: message.readBy
                }
            );
        }
        catch (error) {
            console.log(error.message);
        }
    });
    
    // Reply
    socket.on("replyGroupMessage", async(data, callback) => {
        try {
            const {
                sender,
                groupId,
                replyTo,
                message,
                tempId
            } = data;

            const group = await Group.findById(groupId);

            if (!group) {
                return callback?.({
                success: false,
                error: "Group not found"
            });
        }

        const isMember = group.participants.some(
            p =>
                p.user.toString() ===
                sender.toString()
        );

        if (!isMember) {
            return callback?.({
                success: false,
                error: "You are not in this group anymore, so you can't message here."
            });
        }

            const original = await Message.findById(replyTo);

            if (!original) {
                return callback?.({
                    success:false,
                    error:"Message not found"
                });
            }

            if (original.isDeleted) {
                return callback?.({
                    success:false,
                    error:"Cannot reply to deleted message"
                });
            }

            const newMessage = await Message.create({
                sender,
                groupId,
                content: message,
                replyTo,
                tempId: tempId || crypto.randomUUID(),
                replyPreview:{
                    content: original.content,
                    sender: original.sender,
                    messageType: original.messageType,
                    mediaUrl: original.mediaUrl
                }
            });

            await Group.findByIdAndUpdate(
                groupId,
                {
                    lastMessage: newMessage._id
                }
            );

            await newMessage.populate(
                "sender",
                "name profilePic"
            );

            io.to(groupId.toString()).emit(
                "receiveGroupMessage",
                newMessage
            );

            callback?.({
                success:true,
                data:newMessage
            });
        }
        catch(error){
            callback?.({
                success:false,
                error:error.message
            });
        }
    });

    // Forward
    socket.on("forwardGroupMessage", async(data, callback)=>{
        try{
            const {
                sender,
                groupId,
                originalMessageId,
                tempId
            } = data;

            const group = await Group.findById(groupId);

            if (!group) {
                return callback?.({
                    success: false,
                    error: "Group not found"
                });
            }

            const isMember = group.participants.some(
                p =>
                    p.user.toString() ===
                    sender.toString()
            );

            if (!isMember) {
                return callback?.({
                    success: false,
                    error: "You are not in this group anymore, so you can't message here."
                });
            }

            const original = await Message.findById(
                originalMessageId
            );

            if(!original){
                return callback?.({
                    success:false
                });
            }

            const forwarded = await Message.create({
                sender,
                groupId,
                content:original.content,
                mediaUrl:original.mediaUrl,
                caption:original.caption,
                messageType:original.messageType,
                isForwarded:true,
                forwardedFrom:original.sender,
                tempId: tempId || crypto.randomUUID()
            });

            await Group.findByIdAndUpdate(
                groupId,
                {
                    lastMessage: forwarded._id
                }
            );

            await forwarded.populate(
                "sender",
                "name profilePic"
            );

            io.to(groupId.toString()).emit(
                "receiveGroupMessage",
                forwarded
            );

            callback?.({
                success:true
            });
        }
        catch(error){
            callback?.({
                success:false,
                error:error.message
            });
        }
    });

    // Edit messages
    socket.on("editGroupMessage", async(data)=>{
        try{
            const {
                messageId,
                sender,
                content
            } = data;

            const message = await Message.findById(
                messageId
            );

            if(!message) return;

            if(
                message.sender.toString()
                !== sender.toString()
            ){
                return;
            }

            if (message.isDeleted) return;

            message.content = content;
            message.isEdited = true;

            await message.save();

            io.to(message.groupId.toString())
            .emit(
                "group_message_edited",
                {
                    messageId,
                    content
                }
            );
        }
        catch(error){
            console.log(error.message);
        }
    });

    // Delete for me
    socket.on("deleteGroupMessageForMe", async ({ messageId, userId }) => {
        try {
            const message = await Message.findById(
                messageId
            );

            if (!message) return;

            const alreadyDeleted =
                message.deletedFor.some(
                    id =>
                        id.toString() ===
                        userId.toString()
                );

            if (!alreadyDeleted) {
                message.deletedFor.push(
                    userId
                );

                await message.save();
            }

            socket.emit(
                "group_message_deleted_for_me",
                {
                    messageId
                }
            );
        }
        catch (error) {
            console.log("Delete for me error:", error.message);
        }
    });
};

export default registerGroupHandlers;