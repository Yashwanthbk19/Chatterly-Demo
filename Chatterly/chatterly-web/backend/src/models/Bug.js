import mongoose from "mongoose";

const bugSchema = new mongoose.Schema(
    {
        id: {
            type: Number,
            required: true,
            unique: true,
        },

        issue: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100,
        },

        description: {
            type: String,
            required: true,
            trim: true,
            minlength: 10,
            maxlength: 1000
        },

        status: {
            type: String,
            enum: ["Open", "In Progress", "Resolved"],
            default: "Open",
            index: true,
        },

        severity: {
            type: String,
            enum: ["Low", "Medium", "High", "Critical"],
            required: true,
            index: true,
        },

        assignedDeveloper: {
            type: String,
            trim: true,
            default: null,
        },

        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("Bug", bugSchema);
