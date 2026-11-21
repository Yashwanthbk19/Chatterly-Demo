import "dotenv/config.js";
import http from "http";
import app from "./src/app.js";
import { initSocket } from "./src/sockets/socketServer.js";
import { connectRedis } from "./src/config/redis.js";
import { connectPubSub } from "./src/realtime/redisPubSub.js";

const server = http.createServer(app);

// Initialize Socket
const io = initSocket(server);
app.set("io", io);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectRedis();
    await connectPubSub();

    console.log("S3 Bucket:", process.env.AWS_S3_BUCKET_NAME);

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Server connection failed:", error);
  }
};

startServer();
