import mongoose from "mongoose";
import redisClient from "../config/redis.js";

const getSystemHealth = (io) => {
    // MongoDB Status
    const mongoConnected = mongoose.connection.readyState === 1;

    // Redis Status
    const redisConnected = redisClient.isReady;

    // Socket Status
    const socketConnected = !!io;

    let serverStatus = "Healthy";

    if (!mongoConnected) {
        serverStatus = "Critical";
    } 
    else if (!redisConnected || !socketConnected) {
        serverStatus = "Warning";
    }

    return {
        serverStatus,
        mongoConnected,
        redisConnected,
        socketConnected,
    };
};

export default getSystemHealth;
