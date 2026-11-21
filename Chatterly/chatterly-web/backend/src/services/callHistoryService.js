import Call from "../models/CallLog.js";
import GroupCall from "../models/GroupCall.js";

// Get all call history
export const getCallHistory = async (userId) => {
    const personalCalls = await Call.find({
        $or: [
            {caller: userId},
            {receiver: userId}
        ]
    })
    .populate("caller", "name profilePic")
    .populate("receiver", "name profilePic")
    .sort({createdAt: -1})
    .lean()

    const groupCalls = await GroupCall.find({
        "participants.user": userId
    })
    .populate(
        "groupId",
        "groupName groupProfilePic"
    )
    .populate(
        "startedBy",
        "name profilePic"
    )
    .sort({createdAt: -1})
    .lean();

    return {
        personalCalls,
        groupCalls
    };
};

// Get single call details
export const getCallDetails = async ({
    callId,
    type,
    userId
}) => {
    if (type === "group") {
        const call = await GroupCall.findById(callId)
        .populate(
            "participants.user",
            "name profilePic"
        )
        .populate(
            "groupId",
            "groupName groupProfilePic"
        );

        if (!call) {
            throw new Error("Group call not found")
        }

        const participant = call.participants.find(
            p => p.user._id.toString() === userId.toString()
        );

        if (!participant) {
            throw new Error("Unauthorized");
        }

        return call;
    }

    const call = await Call.findById(callId)
    .populate(
        "caller",
        "name profilePic"
    )
    .populate(
        "receiver",
        "name profilePic"
    );

    if (!call) {
        throw new Error("Call not found");
    }

    if (
        call.caller._id.toString() !== userId.toString() &&
        call.receiver._id.toString() !== userId.toString()
    ) {
        throw new Error("Unauthorized");
    }

    return call;
};

// Missed calls count
export const getMissedCallCount = async (userId) => {
    const count = await Call.countDocuments({
        receiver: userId,
        status: "missed"
    })

    return count;
};

// Quick redial
export const getRedialUser = async ({
    callId,
    userId
}) => {
    const call = await Call.findById(callId);

    if (!call) {
        throw new Error("Call not found");
    }

    if (
        call.caller.toString() !== userId.toString() &&
        call.receiver.toString() !== userId.toString()
    ) {
        throw new Error("Unauthorized");
    }

    const receiverId = call.caller.toString() === userId.toString()
        ? call.receiver
        : call.caller;

    return {
        receiverId,
        callType: call.type
    };
};