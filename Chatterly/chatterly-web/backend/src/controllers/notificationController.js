import {
    createGroupAddedNotification,
    createGroupRemovedNotification
} from "../services/notificationService.js";

export const createGroupAddedNotificationApi = async (req, res) => {
    try {
        const notification = await createGroupAddedNotification(req.body);

        res.status(201).json({
            success: true,
            data: notification
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const createGroupRemovedNotificationApi = async (req, res) => {
    try {
        const notification = await createGroupRemovedNotification(req.body);

        res.status(201).json({
            success: true,
            data: notification
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};