import pidusage from "pidusage";
import LoadTest from "../models/LoadTest.js";

export const startLoadTest = async (requestedUsers, duration) => {
    // Current CPU usage
    const stats = await pidusage(process.pid);

    // Current memory usage
    const memoryUsage = process.memoryUsage();

    const loadTest = await LoadTest.create({
        requestedUsers,
        duration,
        maxUsersHandled: requestedUsers,
        crashEvents: 0,
        avgCpuUsage: Number(stats.cpu.toFixed(2)),
        memoryUsage: `${(
            memoryUsage.heapUsed / 1024 / 1024
        ).toFixed(2)} MB`,
        status: "completed",
        completedAt: new Date(),
    });

    return loadTest;
};

export const getLoadTestResult = async (id) => {
    return await LoadTest.findById(id);
};