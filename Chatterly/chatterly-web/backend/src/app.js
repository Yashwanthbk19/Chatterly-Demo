import express from "express";
import cors from "cors";
import connectDB from "./config/database.js";
import authRoutes from "./routes/authRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
import userRoutes from "./routes/userRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import broadcastRoutes from "./routes/broadcastRoutes.js";
import callRoutes from "./routes/callRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import adminReportRoutes from "./routes/adminReportRoutes.js";
import callHistoryRoutes from "./routes/callHistoryRoutes.js";
import preferenceRoutes from "./routes/preferenceRoutes.js";
import privacyRoutes from "./routes/privacyRoutes.js";
import keyRotationRoutes from "./routes/keyRotationRoutes.js";
import twoFactorRoutes from "./routes/twoFactorRoutes.js";
import blockRoutes from "./routes/blockRoutes.js";
import metricsMiddleware from "./middleware/metricMiddleware.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import performanceRoutes from "./routes/performanceRoutes.js";
import loadTestRoutes from "./routes/loadTestRoutes.js";
import bugRoutes from "./routes/bugRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import releaseRoutes from "./routes/releaseRoutes.js";
import trustedDeviceRoutes from "./routes/trustedDeviceRoutes.js";

const app = express();

// ✅ Connect Database
connectDB();

// ✅ Middleware
app.use(cors());
app.use(express.json());

/* =========================
   REQUEST DECRYPTION
========================= */

// app.use((req, res, next) => {

//   try {

//     // ✅ Skip multipart/form-data
//     if (
//       req.headers["content-type"] &&
//       req.headers["content-type"].includes(
//         "multipart/form-data"
//       )
//     ) {
//       return next();
//     }

//     // ✅ Only decrypt if payload exists
//     if (
//       req.body &&
//       Object.keys(req.body).length > 0 &&
//       req.body.payload
//     ) {

//       req.body = decryptData(
//         req.body.payload
//       );

//     }

//     // ✅ Only decrypt query payload
//     if (
//       req.query &&
//       req.query.payload
//     ) {

//       req.query = decryptData(
//         req.query.payload
//       );

//     }

//     next();

//   } catch (error) {

//     console.log("DECRYPT ERROR:", error);

//     return res.status(400).send(
//       error.message
//     );

//   }
// });

/* =========================
   RESPONSE ENCRYPTION
========================= */

// app.use((req, res, next) => {

//   const originalJson = res.json;

//   res.json = function (data) {

//     const contentType =
//       res.getHeader("Content-Type");

//     if (
//       contentType &&
//       !String(contentType).includes(
//         "application/json"
//       )
//     ) {
//       return originalJson.call(this, data);
//     }

//     // Skip auth encryption
//     if (
//       req.originalUrl.includes("/api/auth")
//     ) {
//       return originalJson.call(this, data);
//     }

//     const encryptedPayload =
//       encryptData(data);

//     return originalJson.call(this, {
//       payload: encryptedPayload
//     });
//   };

//   next();
// });

// Production Metrics
app.use(metricsMiddleware);

// ✅ Routes
// Security routes
app.use("/api/auth", authRoutes);
app.use("/api/trusted-devices", trustedDeviceRoutes);
app.use("/api/2fa", twoFactorRoutes);
app.use("/api/key-rotation", keyRotationRoutes);

// App function routes
app.use("/api/chats", chatRoutes);
app.use("/api/user", userRoutes);
app.use("/api/group", groupRoutes);
app.use("/api/notification", notificationRoutes);
app.use("/api/broadcast", broadcastRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/call", callHistoryRoutes);

// User Safety
app.use("/api/report", reportRoutes);
app.use("/api/admin", adminReportRoutes);
app.use("/api/preferences", preferenceRoutes);
app.use("/api/privacy", privacyRoutes);
app.use("/api/block", blockRoutes);

// System administration
app.use("/api/system-admin", dashboardRoutes);
app.use("/api/system-admin", performanceRoutes);
app.use("/api/system-admin", loadTestRoutes);
app.use("/api/system-admin", bugRoutes);
app.use("/api/system-admin", analyticsRoutes);
app.use("/api/system-admin", releaseRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.send("API is running.... auto jenkins fixed + security testing added + performance metrics added + admin bug routes added");
});

// error handler
app.use(errorHandler);

export default app;
