import {
    getCallHistory,
    getCallDetails,
    getMissedCallCount,
    getRedialUser
} from "../services/callHistoryService.js";

// Call history
export const getHistory = async (req, res) => {
    try {
        const data = await getCallHistory(req.user.id);

        res.status(200).json({
            success: true,
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Call details
export const getDetails = async (req, res) => {
    try {
        const data = await getCallDetails({
            callId: req.params.id,
            type: req.query.type,
            userId: req.user.id
        });

        res.status(200).json({
            success: true,
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Missed call count
export const getMissedCount = async (req, res) => {
    try {
        const count = await getMissedCallCount(req.user.id);

        res.status(200).json({
            success: true,
            count
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Quick redail
export const quickRedial = async (req, res) => {
    try {
        const data = await getRedialUser({
            callId: req.params.id,
            userId: req.user.id
        });

        res.status(200).json({
            success: true,
            data
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};