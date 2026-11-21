
import mongoose from "mongoose";

const joinRequestSchema = new mongoose.Schema(
    {
        group: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Group",
            required: true
        },
        
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
    
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending"
        },
        
        requestedAt: {
            type: Date,
            default: Date.now
        },
    
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
    
        reviewedAt: {
            type: Date,
            default: null
        }
    },
    { timestamps: true }
);

// A user can have only one pending request per group.
joinRequestSchema.index(
    { group: 1, user: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "pending" }
    }
);

joinRequestSchema.index({ group: 1, status: 1, requestedAt: -1 });

export default mongoose.model("JoinRequest", joinRequestSchema);
