import Notification from "../models/Notification.js";

export const createGroupAddedNotification = async ({
    receiver,
    sender,
    groupId,
    groupName
}) => {

    return await Notification.create({
        receiver,
        sender,
        type: "group_added",
        group: groupId,
        message: `Added to ${groupName}`
    });
};

export const createGroupRemovedNotification = async ({
    receiver,
    sender,
    groupId,
    groupName
}) => {

    return Notification.create({
        receiver,
        sender,
        type: "group_removed",
        group: groupId,
        message: `Removed from ${groupName}`
    });
};