import redisClient from "../config/redis.js";

// Revoke a JWT session until it naturally expires
export const revokeSession = async (jti, exp) => {
    try {
        if (!jti || !exp) return;

        const ttl = Math.max(exp - Math.floor(Date.now() / 1000), 0);

        if (ttl > 0) {
            await redisClient.set(`revoked:${jti}`, "true", {
                EX: ttl,
            });
        }
    }
    catch (error) {
        console.error("Failed to revoke session:", error);
    }
};

// Check if a JWT session has been revoked
export const isSessionRevoked = async (jti) => {
    try {
        if (!jti) return false;

        const revoked = await redisClient.get(`revoked:${jti}`);
        return revoked === "true";
    }
    catch (error) {
        console.error("Failed to check revoked session:", error);
        return false;
    }
};

// Add active session
export const addSession = async (userId, jti, exp) => {
    try {
        if (!userId || !jti || !exp) return;

        await redisClient.sAdd(
            `user_sessions:${userId}`,
            JSON.stringify({
                jti,
                exp
            })
        );
    }
    catch (error) {
        console.error("Failed to add session:", error);
    }
};

// Remove active session
export const removeSession = async (userId, jti) => {
    try {
        const key = `user_sessions:${userId}`;

        const sessions = await redisClient.sMembers(key);

        for (const session of sessions) {
            const parsed = JSON.parse(session);

            if (parsed.jti === jti) {
                await redisClient.sRem(key, session);
                break;
            }
        }
    }
    catch (error) {
        console.error("Failed to remove session:", error);
    }
};

// Get all active sessions
export const getUserSessions = async (userId) => {
    try {
        if (!userId) return [];

        return await redisClient.sMembers(`user_sessions:${userId}`);

    }
    catch (error) {
        console.error("Failed to get user sessions:", error);
        return [];
    }
};

// Get inactivity timeout from env
const getSessionInactivitySeconds = () => {
    const minutes = Number(process.env.SESSION_INACTIVITY_MINUTES) || 30;
    return minutes * 60;
};

// Create / refresh session activity
export const refreshSessionActivity = async (jti) => {
    try {
        if (!jti) return false;

        const ttl = getSessionInactivitySeconds();

        await redisClient.set(
            `session_activity:${jti}`,
            "active",
            {
                EX: ttl
            }
        );

        return true;
    }
    catch (error) {
        console.error("Failed to refresh session activity:", error);
        return false;
    }
};

// Check whether session has been inactive
export const isSessionInactive = async (jti) => {
    try {
        if (!jti) return true;

        const activity = await redisClient.get(
            `session_activity:${jti}`
        );

        return !activity;
    }
    catch (error) {
        console.error("Failed to check session activity:", error);

        // Safer behavior: consider session inactive if Redis check fails
        return true;
    }
};