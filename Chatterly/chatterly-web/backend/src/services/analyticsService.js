import Analytics from "../models/Analytics.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Call from "../models/CallLog.js";
import Notification from "../models/Notification.js";
import CrashReport from "../models/CrashReport.js";

export const generateAnalyticsSnapshot = async () => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
        dailyActiveUsers,
        totalMessages,
        deliveredMessages,
        totalCalls,
        completedCalls,
        totalNotifications,
        sentNotifications,
        crashReports,
        androidUsers,
        iosUsers,
    ] = await Promise.all([
        User.countDocuments({
            lastSeen: {
                $gte: startOfToday,
            },
        }),

        // Message success rate
        Message.countDocuments(),
        Message.countDocuments({
            status: "delivered",
        }),

        // Call success rate
        Call.countDocuments(),
        Call.countDocuments({
            status: "completed",
        }),

        // Notification success rate
        Notification.countDocuments(),
        Notification.countDocuments({
            status: "sent",
        }),

        // Crash report
        CrashReport.countDocuments({
            createdAt: {
                $gte: startOfToday,
            },
        }),

        // Platform users
        User.countDocuments({
            platform: "android",
        }),

        User.countDocuments({
            platform: "ios",
        }),
    ]);

    // Calculate
    const messageDeliveryRate = totalMessages === 0
        ? 100 : Number(
            (
                (deliveredMessages / totalMessages) * 100
            ).toFixed(2)
        );

    const callSuccessRate = totalCalls === 0
        ? 100 : Number(
            (
                (completedCalls / totalCalls) * 100
            ).toFixed(2)
        );

    const notificationSuccessRate = totalNotifications === 0
        ? 100 : Number(
            (
                (sentNotifications / totalNotifications) * 100
            ).toFixed(2)
        );

    return await Analytics.findOneAndUpdate(
        {
            snapshotDate: {
                $gte: startOfToday
            }
        },
        {
            dailyActiveUsers,
            messageDeliveryRate,
            callSuccessRate,
            notificationSuccessRate,
            crashReports,
            androidUsers,
            iosUsers,
            snapshotDate: new Date(),
        },
        {
            upsert: true,
            returnDocument: "after",
            runValidators: true
        }
    );
}

export const getLatestAnalytics = async () => {
    return await Analytics
    .findOne()
    .sort({
        snapshotDate: -1
    })
    .lean();
};

export const exportAnalytics = async () => {
    return await Analytics
        .find()
        .sort({
            snapshotDate: -1
        })
        .lean();
};