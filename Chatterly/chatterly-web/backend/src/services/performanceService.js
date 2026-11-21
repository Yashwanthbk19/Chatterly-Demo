import mongoose from "mongoose";
import metricsService from "./metricService.js";

export const getPerformanceMetrics = async () => {
    const start = process.hrtime.bigint();

    await mongoose.connection.db.admin().ping();

    const end = process.hrtime.bigint();
    const dbLatency = Number(
        ((Number(end -start)) / 1_000_000).toFixed(2)
    );

    metricsService.recordSlowQuery(dbLatency);

    return {
        apiResponseTime: metricsService.getAverageResponseTime(),
        dbLatency,
        slowQueries: metricsService.getSlowQueryCount(),
        mediaCompression: "Enabled",
        cdnStatus: "Active",
    };
};
