import mongoose from "mongoose";

const trustedDeviceSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        deviceId: {
            type: String,
            required: true,
            trim: true
        },

        deviceName: {
            type: String,
            required: true,
            trim: true
        },

        platform: {
            type: String,
            enum: ["android", "ios", "web"],
            required: true
        },

        browser: {
            type: String,
            default: ""
        },

        ipAddress: {
            type: String,
            default: ""
        },

        trusted: {
            type: Boolean,
            default: true
        },

        lastLoginAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true
    }
);

trustedDeviceSchema.index(
    {
        user: 1,
        deviceId: 1
    },
    {
        unique: true
    }
);

export default mongoose.model("TrustedDevice", trustedDeviceSchema);
