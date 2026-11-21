import {
    generateAnalyticsSnapshot,
    getLatestAnalytics,
    exportAnalytics,
} from "../services/analyticsService.js";

// Generate analytics snapshot
export const generateAnalytics = async (req, res) => {
    try {
        const analytics = await generateAnalyticsSnapshot();

        return res.status(200).json({
            success: true,
            message: "Analytics snapshot generated successfully.",
            data: {
                ...analytics.toObject(),
                appVersion: process.env.APP_VERSION,
            },
        });
    } catch (error) {
        console.error("Generate Analytics Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to generate analytics snapshot.",
        });
    }
};

// Latest analytics dashboard
export const getAnalyticsDashboard = async (req, res) => {
    try {
        const analytics = await getLatestAnalytics();

        if (!analytics) {
            return res.status(404).json({
                success: false,
                message: "No analytics data found.",
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                ...analytics,
                appVersion: process.env.APP_VERSION,
            },
        });
    } catch (error) {
        console.error("Analytics Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch analytics dashboard.",
        });
    }
};

// Export analytics
export const exportAnalyticsDashboard = async (req, res) => {
    try {
        const analytics = await exportAnalytics();

        return res.status(200).json({
            success: true,
            message: "Analytics exported successfully.",
            data: analytics,
        });
    } catch (error) {
        console.error("Export Analytics Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to export analytics.",
        });
    }
};
