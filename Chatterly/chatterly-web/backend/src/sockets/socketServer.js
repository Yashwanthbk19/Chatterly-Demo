import { Server } from "socket.io";
import registerMessageHandlers from "./messageSocket.js";
import registerGroupHandlers from "./groupSocket.js";
import Message from "../models/Message.js";
import Chat from "../models/Chat.js";
import User from "../models/User.js";
import redisClient from "../config/redis.js";
import Group from "../models/Group.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { pubClient, subClient } from "../realtime/redisPubSub.js";
import registerCallHandlers from "./callSocket.js";
import Call from "../models/CallLog.js";
import { saveCallLog } from "../services/callService.js";
import registerGroupCallHandlers from "./groupCallSocket.js";
import GroupCall from "../models/GroupCall.js";

let io;

// Init socket
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET","POST"],
      credentials: true,
    },

    transports: ["websocket","polling"],

    allowEIO3: true,

    pingTimeout: 60000,
    pingInterval: 25000,
  });

  const reconnectTimers = new Map();
  const groupReconnectTimers = new Map();

  // For message and group socket
  io.adapter(createAdapter(pubClient, subClient));

  io.engine.on("connection_error", (err) => {
    console.log("Socket engine error:", err.message);
  });

  // Connection
  io.on("connection", (socket) => {
    console.log("Socket is Connected:", socket.id);

    // User register after connecting
    socket.on("registerUser", async(userId, callback) => {
      try{
        if (!userId) {
          return callback?.({
            success: false,
            message: "User ID required",
          });
        }

        socket.userId = userId;

        // Store in redis
        await redisClient.set(`online:${userId}`, socket.id);
        
        await redisClient.sAdd("online_users", userId);
        
        // Join room
        socket.join(userId);
        console.log(`User ${userId} registered `);

        // Send ACk
        callback?.({success: true});

        // Resume active call if user reconnects
        const activeCall = await Call.findOne({
          $or: [
            { caller: userId },
            { receiver: userId }
          ],
          status: "connected"
        });

        if (activeCall) {
          // Stop auto disconnect timer
          const timer = reconnectTimers.get(
            activeCall._id.toString()
          );

          if (timer) {
            clearTimeout(timer);
            
            reconnectTimers.delete(
              activeCall._id.toString()
            );
          }

          const otherUser = activeCall.caller.toString() === userId
            ? activeCall.receiver.toString()
            : activeCall.caller.toString();

          // reconnecting user
          socket.emit("call_reconnected", {
            callId: activeCall._id,
            userId
          });

          // other participant
          io.to(otherUser).emit("call_reconnected", {
            callId: activeCall._id,
            userId
          });
        }

        // User is online
        io.emit("user_online", {
          userId,
          lastSeen: null
        });

        setImmediate(async () => {
          try {
            // Send online users
            const onlineUser = await redisClient.sMembers("online_users");
 
            socket.emit("online_users", {
              userIds: onlineUser
            });

            // FIND undelivered messages FIRST
            const undeliveredMessages = await Message.find({
              receiver: userId,
              status: "sent"
            }).select("_id sender");

            // Mark pending messages as delivered
            if (undeliveredMessages.length > 0) {
              const ids = undeliveredMessages.map(
                msg => msg._id
              );

              await Message.updateMany(
                {
                  _id: {$in: ids}
                },
                {
                  status: "delivered",
                  deliveredAt: new Date()
                }
              );

              // NOTIFY senders
              for (const msg of undeliveredMessages) {
                io.to(msg.sender.toString()).emit("message_delivered", {
                  messageId: msg._id,
                });
              }
            }
        
            // Send missed messages
            const missedMessages = await Message.find({
              receiver: userId,
              status: {$in: ["sent", "delivered"]}
            })
            .sort({createdAt: 1})
            .limit(50)
            .populate("sender", "name profilePic");

            if (missedMessages.length > 0) {
              socket.emit("missed_messages", missedMessages);
            }

            // Auto join chats
            const chats = await Chat.find({
              "participants.user": userId
            });

            const groups = await Group.find({
              "participants.user": userId
            });

            for (const group of groups) {
              socket.join(group._id.toString());
            }

            for (const chat of chats) {
              if (chat.participants.length === 2) {
                const roomId = chat.participants
                .map(p => p.user.toString())
                .sort()
                .join("_");

                socket.join(roomId);
              }
            }
          }
          catch (bgError) {
            console.log("Background register task error:", bgError.message);
          }
        });
      }
      catch (error) {
        console.log("Register user error: ", error.message);
        
        callback?.({
          success: false,
          error: error.message,
        });
      }
    });

    // Register events
    registerMessageHandlers(io, socket);
    registerGroupHandlers(io, socket);
    registerCallHandlers(io, socket);
    registerGroupCallHandlers(io, socket);

    // Disconnect
    socket.on("disconnect", async (reason) => {
      try {
        console.log(`Disconnected:${socket.id} | ${reason}`);

        if (!socket.userId) return;

        await redisClient.del(`online:${socket.userId}`);

        await redisClient.sRem("online_users", socket.userId);

        //update last seen
        const lastSeen = new Date();
        await User.findByIdAndUpdate(socket.userId, {lastSeen});

        // Check active call
        const activeCall = await Call.findOne({
          $or: [
            { caller: socket.userId },
            { receiver: socket.userId }
          ],
          status: "connected"
        });

        // 1 to 1 call handller
        if (activeCall) {
          const otherUser = activeCall.caller.toString() === socket.userId
            ? activeCall.receiver.toString()
            : activeCall.caller.toString();

          // Notify other participant
          io.to(otherUser).emit("call_reconnecting", {
            callId: activeCall._id,
            userId: socket.userId
          });

          // Wait for reconnect
          const timer = setTimeout(async () => {
            const latestCall = await Call.findById(activeCall._id);

            if (!latestCall) {
              reconnectTimers.delete(activeCall._id.toString());
              return;
            }

            if (latestCall.status === "connected") {
              latestCall.status = "completed";
              latestCall.endedAt = new Date();
              latestCall.duration = latestCall.startedAt
                ? Math.floor(
                  (
                    latestCall.endedAt.getTime() -
                    latestCall.startedAt.getTime()
                  ) / 1000
                ) : 0;

              await latestCall.save();

              const message = await saveCallLog({
                chatId: latestCall.chat,
                senderId: latestCall.caller,
                receiverId: latestCall.receiver,
                status: "completed",
                type: latestCall.type,
                duration: latestCall.duration
              });

              const roomId = [
                String(latestCall.caller),
                String(latestCall.receiver)
              ].sort().join("_");

              io.to(roomId).emit("receiveMessage", message);
              io.to(otherUser).emit("call_disconnected", {
                callId: latestCall._id,
                reason: "Network disconnected"
              });
            }

            reconnectTimers.delete(
              activeCall._id.toString()
            );
          }, 10000);

          reconnectTimers.set(
            activeCall._id.toString(),
            timer
          );
        }

        // Handle active group calls
        const activeGroupCalls = await GroupCall.find({
          "participants.user": socket.userId,
          status: {
            $in: ["active", "locked"]
          }
        });

        for (const groupCall of activeGroupCalls) {
          const key = `${groupCall._id}_${socket.userId}`;

          io.to(`groupcall_${groupCall._id}`).emit(
            "group_call_reconnecting",
            {
              groupCallId: groupCall._id,
              userId: socket.userId
            }
          );

          const existingTimer = groupReconnectTimers.get(key);

          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(async () => {
            const latestCall = await GroupCall.findById(groupCall._id);

            if (!latestCall) {
              groupReconnectTimers.delete(key);
              return;
            }

            const participant = latestCall.participants.find(
              p =>
                p.user.toString() === socket.userId &&
                !p.leftAt
            );

            if (!participant) {
              groupReconnectTimers.delete(key);
              return;
            }

            // MARK USER LEFT
            participant.leftAt = new Date();
            await latestCall.save();

            const activeParticipants = latestCall.participants.filter(
              p => !p.leftAt
            );

            if (activeParticipants.length === 0) {
              latestCall.status = "ended";
              latestCall.endedAt = new Date();

              latestCall.duration = Math.floor(
                (
                  latestCall.endedAt.getTime() -
                  latestCall.startedAt.getTime()
                ) / 1000
              );

              await latestCall.save();

              io.to(`groupcall_${latestCall._id}`).emit(
                "group_call_ended",
                {
                  groupCallId: latestCall._id,
                  reason: "All participants left"
                }
              );
            }
            else {
              await latestCall.save();

              io.to(`groupcall_${latestCall._id}`).emit(
                "group_call_user_left",
                {
                  groupCallId: latestCall._id,
                  userId: socket.userId
                }
              );
            }
            groupReconnectTimers.delete(key);
          },
          30000);

          groupReconnectTimers.set(
            key,
            timer
          );
        }

        // User is offline and last seen
        io.emit("user_offline", {
          userId: socket.userId,
          lastSeen
        });

        console.log(`User offline: ${socket.userId}`);
      }
      catch (error) {
        console.log("Disconnected error: ", error.message);
      }
    });
  });
  return io;
};

export const getIO = () => io;
