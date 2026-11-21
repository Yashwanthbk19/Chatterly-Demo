import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        joinedAt: {
            type: Date,
            default: Date.now
        },

        leftAt: {
            type: Date,
            default: null
        },

        isMuted: {
            type: Boolean,
            default: false
        },

        isOnHold: {
            type: Boolean,
            default: false
        }
    },
    {
        _id: false
    }
);

const callSchema = new mongoose.Schema(
    {
        caller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        receiver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        participants: {
            type: [participantSchema],
            default: []
        },

        chat: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Chat",
            required: true,
            index: true,
        },

        type: {
            type: String,
            enum: ["audio", "video"],
            default: "audio",
        },

        status: {
            type: String,
            enum: [
                "calling",
                "ringing",
                "connected",
                "completed",
                "missed",
                "rejected",
                "cancelled",
            ],
            default: "calling",
            index: true,
        },

        screenSharingUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        isScreenSharing: {
            type: Boolean,
            default: false
        },

        startedAt: {
            type: Date,
            default: null,
        },

        endedAt: {
            type: Date,
            default: null,
        },

        duration: {
            type: Number,
            default: 0, // seconds
        },
    },
    { timestamps: true }
);

callSchema.index({
    caller: 1,
    receiver: 1,
    status: 1,
});

callSchema.index({createdAt: -1});

export default mongoose.model("Call", callSchema);
