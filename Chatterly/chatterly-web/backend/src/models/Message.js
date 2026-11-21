import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
      default: null,
      index: true
    },

    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
      index: true
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },

    callId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupCall",
      default: null
    },

    callStatus: {
      type: String,
      enum: [
        "started",
        "completed",
        "missed",
        "not_answered",
        "rejected",
        "cancelled",
        "active",
        "locked",
        "ended"
      ],
      default: null
    },

    callType: {
      type: String,
      enum: ["audio", "video"],
      default: null
    },

    content: {
      type: String,
      trim: true
    },

    encryptedContent: {
      type: String,
      default: ""
    },

    messageType: {
      type: String,
      enum: ["text", "image", "video", "file", "audio", "call", "system"],
      default: "text"
    },

    // Reply system
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },

    // Keeps reply visible even if original deleted
    replyPreview: {
      content: {
        type: String,
        default: ""
      },

      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
      },

      messageType: {
        type: String,
        enum: ["text", "image", "video", "file", "audio", "call"],
        default: "text"
      },

      mediaUrl: {
        type: String,
        default: ""
      },
    },

    // Forward
    isForwarded: {
      type: Boolean,
      default: false
    },

    forwardedFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    // Media
    mediaType: {
      type: String,
      enum: ["image", "video", "audio", null],
      default: null
    },

    mediaUrl: {
      type: String,
      default: ""
    },
    
    thumbnailUrl: {
      type: String,
      default: ""
    },

    caption: {
      type: String,
      default: ""
    },

    audioDuration: {
      type: Number,
      default: 0
    },

    waveform: {
      type: [Number],
      default: []
    },

    mediaSize: {
      type: Number,
      default: 0
    },

    fileName: {
      type: String,
      default: ""
    },

    filePath: {
      type: String,
      default: ""
    },

    fileType: {
      type: String,
      default: ""
    },

    fileSize: {
      type: Number,
      default: 0
    },

    // Message status
    status: {
      type: String,
      enum: ["sent", "delivered", "read"],
      default: "sent",
      index: true
    },

    deliveredAt: {
      type: Date
    },

    disappearAfter: {
      type: String,
      enum: ["off", "24h", "7d", "30d"],
      default: "off"
    },

    expiresAt: {
      type: Date,
      default: null,
      index: {
    expireAfterSeconds: 0
  }
    },

    readBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      readAt: Date
    }],

    // ✅ From team (IMPORTANT)
    tempId: {
      type: String,
      unique: true,
      sparse: true
    },

    // Delete system
    deletedFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    isDeleted: {
      type: Boolean,
      default: false
    },

    deletedAt: {
      type: Date,
      default: null
    },

    // Edit system
    isEdited: {
      type: Boolean,
      default: false
    },

    // Pin system
    isPinned: {
      type:Boolean,
      default: false
    },

    pinnedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    pinnedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

// ✅ Keep useful indexes
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({groupId: 1, createdAt: -1});
messageSchema.index({ receiver: 1, status: 1 });

// ✅ Team retry protection index
messageSchema.index(
  { sender: 1, tempId: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model("Message", messageSchema);
