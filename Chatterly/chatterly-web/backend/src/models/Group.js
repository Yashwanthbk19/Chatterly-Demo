import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    role: {
      type: String,
      enum: ["superadmin", "admin", "moderator", "member"],
      default: "member"
    },

    archived: {
      type: Boolean,
      default: false
    },

    pinned: {
      type: Boolean,
      default: false
    },

    isMuted: {
      type:Boolean,
      default:false
    },

    joinedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    _id: false
  }
);

const groupSchema = new mongoose.Schema(
  {
    groupName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },

    description: {
      type: String,
      default: ""
    },

    rules: {
      type: [{
        type: String,
        trim: true,
        maxlength: 300
      }],
      default: []
    },

    groupPhoto: {
      type: String,
      default: ""
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    reportCount: {
      type: Number,
      default: 0
    },

    isFlagged: {
      type: Boolean,
      default: false
    },

    isSuspended: {
      type: Boolean,
      default: false
    },

    participants: [participantSchema],

    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null
    },

    inviteToken: {
      type: String,
      default: null
    },

    inviteLinkEnabled: {
      type: Boolean,
      default: false
    },

    inviteExpiresAt: {
      type: Date,
      default: null
    },

    settings: {
      onlyAdminsCanMessage: {
        type:Boolean,
        default:false
      },

      onlyAdminsCanShareMedia: {
        type:Boolean,
        default:false
      },

      // Role-based permissions
      rolePermissions: {
        member: {
          addMembers: {
            type: Boolean,
            default: false
          }
        },

        moderator: {
          addMembers: {
            type: Boolean,
            default: false
          },

          assignRoles: {
            type: Boolean,
            default: false
          },
      
          pinMessages: {
            type: Boolean,
            default: false
          },
      
          editGroupInfo: {
            type: Boolean,
            default: false
          },
        },

        admin: {
          approveJoinRequests: {
            type: Boolean,
            default: false
          }
        }
      }
    }
  },
  {
    timestamps: true
  }
);

// Fast creator lookup
groupSchema.index({createdBy: 1});

// Fast participant lookup
groupSchema.index({"participants.user": 1});

// Fast sorting by latest activity
groupSchema.index({updatedAt: -1});

export default mongoose.model("Group", groupSchema);
