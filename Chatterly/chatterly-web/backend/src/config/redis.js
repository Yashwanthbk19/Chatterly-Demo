import { createClient } from "redis";
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("connect", () => console.log("✅ Redis Connected"));
redisClient.on("ready", () => console.log("🔥 Redis Ready"));
redisClient.on("error", (err) => console.log("❌ Redis Error:", err));

export const connectRedis = async () => {
    try{
        await redisClient.connect();
    }

    catch (error) {
        console.error("Redis connection failed : ", error);
        process.exit(1);
    }
}

export const getRedisClient = () => redisClient;

export default redisClient;
