import redisClient from "../config/redis.js";

export const getActiveUsersCount = async () => {
    try {
        return await redisClient.sCard("online_users");
    }
    catch (error) {
        console.error("Active users count error:", error.message);
    
        return 0;
    }
};