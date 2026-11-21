import {
    startLoadTest,
    getLoadTestResult,
} from "../services/loadTestService.js";

export const createLoadTest = async (req, res) => {
    try {
        const { requestedUsers, duration } = req.body;

        if (!requestedUsers || !duration) {
            return res.status(400).json({
                success: false,
                message: "Requested users and duration are required.",
            });
        }

        const loadTest = await startLoadTest(
            requestedUsers,
            duration
        );

        return res.status(201).json({
            success: true,
            message: "Load test created successfully.",
            data: loadTest,
        });
    }
    catch (error) {
        console.error("Load Test Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create load test.",
        });
    }
};

export const getLoadTest = async (req, res) => {
    try {
        const loadTest = await getLoadTestResult(req.params.id);

        if (!loadTest) {
            return res.status(404).json({
                success: false,
                message: "Load test not found.",
            });
        }

        return res.status(200).json({
            success: true,
            data: loadTest,
        });
    }
    catch (error) {
        console.error("Get load Test Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch load test.",
        });
    }
};
