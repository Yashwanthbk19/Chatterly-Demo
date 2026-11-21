import mongoose from "mongoose";

const loadTestSchema = new mongoose.Schema(
    {
        requestedUsers: {
            type: Number,
            required: true,
            min: 1,
        },

        duration: {
            type: Number,
            required: true,
            min: 1, // Minutes
        },

        maxUsersHandled: {
            type: Number,
            default: 0,
        },

        crashEvents: {
            type: Number,
            default: 0,
        },

        avgCpuUsage: {
            type: Number,
            default: 0,
        },

        memoryUsage: {
            type: String,
            default: "Stable",
        },

        status: {
            type: String,
            enum: [
                "running",
                "completed",
                "failed",
            ],
            default: "running",
        },

        startedAt: {
            type: Date,
            default: Date.now,
        },

        completedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("LoadTest", loadTestSchema);
