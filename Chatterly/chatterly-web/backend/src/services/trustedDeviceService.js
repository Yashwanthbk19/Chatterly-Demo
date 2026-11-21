import TrustedDevice from "../models/TrustedDevice.js";

// Register current device
export const registerTrustedDevice = async ({
    userId,
    deviceId,
    deviceName,
    platform,
    browser = "",
    ipAddress = ""
}) => {
    let device = await TrustedDevice.findOne({
        user: userId,
        deviceId
    });

    if (device) {
        device.deviceName = deviceName;
        device.platform = platform;
        device.browser = browser;
        device.ipAddress = ipAddress;
        device.trusted = true;
        device.lastLoginAt = new Date();

        await device.save();

        return device;
    }

    device = await TrustedDevice.create({
        user: userId,
        deviceId,
        deviceName,
        platform,
        browser,
        ipAddress,
        trusted: true
    });

    return device;
};

// Verify trusted device
export const verifyTrustedDevice = async ({
    userId,
    deviceId
}) => {
    const device = await TrustedDevice.findOne({
        user: userId,
        deviceId,
        trusted: true
    });

    if (!device) {
        return null;
    }

    device.lastLoginAt = new Date();
    await device.save();

    return device;
};

// Get all trusted devices
export const getTrustedDevices = async (userId) => {
    return await TrustedDevice.find({
        user: userId,
        trusted: true
    }).sort({
        lastLoginAt: -1
    });
};

// Remove trusted device
export const removeTrustedDevice = async ({
    userId,
    deviceId
}) => {
    const device = await TrustedDevice.findOne({
        user: userId,
        deviceId
    });

    if (!device) {
        throw new Error("Trusted device not found");
    }

    await device.deleteOne();

    return true;
};

// Check or register trusted device after successful login
export const handleTrustedDeviceLogin = async ({
    userId,
    deviceId
}) => {
    if (!deviceId) {
        return {
            trusted: false,
            skipped: true
        };
    }

    const device = await verifyTrustedDevice({
        userId,
        deviceId
    });

    if (device) {
        return {
            trusted: true,
            device
        };
    }

    return {
        trusted: false
    };
};
