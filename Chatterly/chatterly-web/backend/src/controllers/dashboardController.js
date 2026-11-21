import metricsService from "../services/metricService.js";
import getSystemHealth from "../utils/systemHealth.js";
import { getActiveUsersCount } from "../services/dashboardService.js";

export const getDashboardOverview = async (req, res) => {
    try {
        const io = req.app.get("io");

        const health = getSystemHealth(io);
        const metrics = metricsService.getMetrics();
        const activeUsers = await getActiveUsersCount();

        return res.status(200).json({
            success: true,
            data: {
                serverStatus: health.serverStatus,
                avgResponseTime: metrics.avgResponseTime,
                activeUsers,
                errorRate: metrics.errorRate,
                buildVersion: process.env.APP_VERSION || "1.0.0",
            },
        });
    } catch (error) {
        console.error("Dashboard Error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch dashboard overview.",
        });
    }
};
