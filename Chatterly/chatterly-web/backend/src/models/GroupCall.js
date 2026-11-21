import mongoose from "mongoose";

const participantSchema = new mongoose.Schema({
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

    isOnHold: {
        type: Boolean,
        default: false
    },

    isMuted: {
        type: Boolean,
        default: false
    },

    videoEnabled: {
        type: Boolean,
        default: true
    }
},
{
    _id: false
});

const groupCallSchema = new mongoose.Schema({
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group",
        required: true,
        index: true
    },

    startedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    participants: {
        type: [participantSchema],
        default: []
    },

    type: {
        type: String,
        enum: ["audio", "video"],
        default: "video"
    },

    status: {
        type: String,
        enum: [
            "active",
            "locked",
            "ended"
        ],
        default: "active",
        index: true
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
        default: Date.now
    },

    endedAt: {
        type: Date,
        default: null
    },

    duration: {
        type: Number,
        default: 0
    }
},
{
    timestamps: true
});

groupCallSchema.index({
    groupId: 1,
    status: 1
});

groupCallSchema.index({startedBy: 1});
groupCallSchema.index({createdAt: -1});

export default mongoose.model(
    "GroupCall",
    groupCallSchema
);