import {
    createBug,
    getAllBugs,
    getBugsBySeverity,
    assignDeveloper,
    resolveBug,
} from "../services/bugService.js";

export const createBugReport = async (req, res) => {
    try {
        const bug = await createBug(req.body);

        return res.status(201).json({
            success: true,
            message: "Bug created successfully.",
            data: bug,
        });
    }
    catch (error) {
        console.error("Create Bug Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create bug.",
        });
    }
};

export const getBugReports = async (req, res) => {
    try {
        const { severity } = req.query;

        const bugs = severity
            ? await getBugsBySeverity(severity)
            : await getAllBugs();

        return res.status(200).json({
            success: true,
            count: bugs.length,
            data: bugs,
        });
    }
    catch (error) {
        console.error("Fetch Bugs Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch bugs.",
        });
    }
};

export const assignBugDeveloper = async (req, res) => {
    try {
        const { assignedDeveloper } = req.body;

        if (!assignedDeveloper) {
            return res.status(400).json({
                success: false,
                message: "Developer name is required.",
            });
        }

        const bug = await assignDeveloper(
            req.params.id,
            assignedDeveloper
        );

        if (!bug) {
            return res.status(404).json({
                success: false,
                message: "Bug not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Developer assigned successfully.",
            data: bug,
        });
    }
    catch (error) {
        console.error("Assign Developer Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to assign developer.",
        });
    }
};

export const resolveBugReport = async (req, res) => {
    try {
        const bug = await resolveBug(req.params.id);

        if (!bug) {
            return res.status(404).json({
                success: false,
                message: "Bug not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Bug marked as resolved.",
            data: bug,
        });
    }
    catch (error) {
        console.error("Resolve Bug Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to resolve bug.",
        });
    }
};
