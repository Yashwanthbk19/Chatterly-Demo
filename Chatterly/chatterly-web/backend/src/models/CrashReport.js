import mongoose from "mongoose";

const crashReportSchema = new mongoose.Schema(
    {
        message: {
            type: String,
            required: true,
            trim: true,
        },

        stack: {
            type: String,
            default: "",
        },

        route: {
            type: String,
            default: "",
        },

        method: {
            type: String,
            default: "",
        },

        statusCode: {
            type: Number,
            default: 500,
        },

        resolved: {
            type: Boolean,
            default: false,
            index: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("CrashReport", crashReportSchema);
