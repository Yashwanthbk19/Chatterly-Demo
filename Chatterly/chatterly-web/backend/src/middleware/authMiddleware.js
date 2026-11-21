import jwt from "jsonwebtoken";
import logger from "./logger.js";
import {
  isSessionRevoked,
  refreshSessionActivity,
  isSessionInactive
} from "../services/sessionService.js";

export default async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    logger.error("❌ No token provided"); // ✅ log added

    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check whether this session has been revoked
    if (await isSessionRevoked(decoded.jti)) {
      logger.warn(`❌ Revoked session: ${decoded.id}`);

      return res.status(401).json({
        success: false,
        message: "Session expired. Please login again."
      });
    }

    // Check inactivity
    if (await isSessionInactive(decoded.jti)) {
      logger.warn(`❌ Inactive session expired: ${decoded.id}`);

      return res.status(401).json({
        success: false,
        message: "Session expired due to inactivity. Please login again."
      });
    }

    // User is active, refresh inactivity timer
    await refreshSessionActivity(decoded.jti);

    req.user = decoded;
    logger.info(`✅ Auth success: ${decoded.id || decoded._id}`); // ✅ log added
    next();
  }
  catch (error) {
    logger.error(`❌ Invalid token: ${error.message}`);
    
    return res.status(401).json({
      success: false,
      message: "Invalid Token"
    });
  }
};
