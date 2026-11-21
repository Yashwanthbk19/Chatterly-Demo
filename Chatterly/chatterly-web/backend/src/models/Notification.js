import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
{
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },

    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Group"
    },

    type: {
        type: String,
        required: true
    },

    message: {
        type: String,
        required: true
    },

    isRead: {
        type: Boolean,
        default: false
    },

    status: {
        type: String,
        enum: ["sent", "failed"],
        default: "sent",
        index: true,
    },
},
{
    timestamps: true
}
);

export default mongoose.model("Notification", notificationSchema);