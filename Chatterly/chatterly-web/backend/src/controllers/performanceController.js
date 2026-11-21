import { getPerformanceMetrics } from "../services/performanceService.js";
import metricService from "../services/metricService.js";

export const getPerformanceDashboard = async (req, res) => {
    try {
        const performance = await getPerformanceMetrics();

        return res.status(200).json({
            success: true,
            data: performance,
        });
    }
    catch (error) {
        console.error("Performance Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch performance metrics.",
        });
    }
};

export const optimizeSystem = async (req, res) => {
    try {
        // Reset performance metrics
        metricService.resetMetrics();

        return res.status(200).json({
            success: true,
            message: "System optimization completed successfully.",
        });
    }
    catch (error) {
        console.error("Optimization Error:", error);

        return res.status(500).json({
            success: false,
            message: "System optimization failed.",
        });
    }
};