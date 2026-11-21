import {
    registerTrustedDevice,
    verifyTrustedDevice,
    getTrustedDevices,
    removeTrustedDevice
} from "../services/trustedDeviceService.js";

// Register Trusted Device
export const registerDevice = async (req, res) => {
    try {
        const {
            deviceId,
            deviceName,
            platform,
            browser
        } = req.body;

        if (!deviceId || !deviceName || !platform) {
            return res.status(400).json({
                success: false,
                message: "deviceId, deviceName and platform are required"
            });
        }

        const device = await registerTrustedDevice({
            userId: req.user.id,
            deviceId,
            deviceName,
            platform,
            browser,
            ipAddress: req.ip
        });

        return res.status(201).json({
            success: true,
            message: "Trusted device registered successfully",
            data: device
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Verify Trusted Device
export const verifyDevice = async (req, res) => {
    try {
        const { deviceId } = req.body;

        if (!deviceId) {
            return res.status(400).json({
                success: false,
                message: "deviceId is required"
            });
        }

        const device = await verifyTrustedDevice({
            userId: req.user.id,
            deviceId
        });

        if (!device) {
            return res.status(404).json({
                success: false,
                message: "Trusted device not found"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Trusted device verified",
            data: device
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Get Trusted Devices
export const getDevices = async (req, res) => {
    try {
        const devices = await getTrustedDevices(req.user.id);

        return res.status(200).json({
            success: true,
            count: devices.length,
            data: devices
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Remove Trusted Device
export const removeDevice = async (req, res) => {
    try {
        await removeTrustedDevice({
            userId: req.user.id,
            deviceId: req.params.deviceId
        });

        return res.status(200).json({
            success: true,
            message: "Trusted device removed successfully"
        });
    }
    catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
