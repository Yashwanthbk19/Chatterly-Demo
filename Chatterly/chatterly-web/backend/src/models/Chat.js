import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    participants: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },

        archived: {
          type: Boolean,
          default: false,
        },

        pinned: {
          type: Boolean,
          default: false
        },

        markedUnread: {
          type: Boolean,
          default: false
        },

        markedUnreadAt: {
          type: Date,
          default: null
        },
      },
    ],

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
  },
  { timestamps: true }
);

// Ensure only 2 participants
chatSchema.path("participants").validate(function (value) {
  return value.length === 2;
}, "Chat must contain exactly 2 participants");

// Index for fast lookup
chatSchema.index({ "participants.user": 1 });

export default mongoose.model("Chat", chatSchema);