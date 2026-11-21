import {
    getReleaseChecklist,
    updateReleaseChecklist,
    validateRelease,
    goLive,
} from "../services/releaseService.js";

// Get Release Checklist
export const getRelease = async (req, res) => {
    try {
        const checklist = await getReleaseChecklist();

        return res.status(200).json({
            success: true,
            data: {
                ...checklist.toObject(),
                buildVersion: process.env.APP_VERSION,
            },
        });
    } catch (error) {
        console.error("Get Release Checklist Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch release checklist.",
        });
    }
};

// Update Release Checklist
export const updateRelease = async (req, res) => {
    try {
        const checklist = await updateReleaseChecklist(req.body);

        return res.status(200).json({
            success: true,
            message: "Release checklist updated successfully.",
            data: {
                ...checklist.toObject(),
                buildVersion: process.env.APP_VERSION,
            },
        });
    } catch (error) {
        console.error("Update Release Checklist Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update release checklist.",
        });
    }
};

// Validate Release
export const validateReleaseChecklist = async (req, res) => {
    try {
        const validation = await validateRelease();

        return res.status(200).json({
            success: true,
            data: validation,
        });
    } catch (error) {
        console.error("Validate Release Error:", error);

        return res.status(500).json({
            success: false,
            message: "Release validation failed.",
        });
    }
};

// Go Live
export const deployRelease = async (req, res) => {
    try {
        const release = await goLive();

        return res.status(200).json({
            success: true,
            message: "Application deployed successfully.",
            data: {
                ...release.toObject(),
                buildVersion: process.env.APP_VERSION,
            },
        });
    } catch (error) {
        console.error("Go Live Error:", error);

        return res.status(400).json({
            success: false,
            message: error.message,
        });
    }
};
