import { createClient } from "redis";

const pubClient = createClient({
    url: process.env.REDIS_URL,
});

const subClient = pubClient.duplicate();

pubClient.on("error", (err) => console.log("Redis Pub Error:", err));
subClient.on("error", (err) => console.log("Redis Sub Error:", err));

export const connectPubSub = async () => {
    await pubClient.connect();
    await subClient.connect();
    console.log("Redis Pub/Sub Ready");
};

export { pubClient, subClient };
