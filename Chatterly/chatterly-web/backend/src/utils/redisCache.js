import getRedisClient from "../config/redis.js";

// Set cache with TTL
export const setCache = async (key, value, ttl = 300) => {
  const redis = getRedisClient();
  await redis.set(key, JSON.stringify(value), {EX : ttl});
};

// Get from cache
export const getCache = async (key) => {
    const redis = getRedisClient();
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
};