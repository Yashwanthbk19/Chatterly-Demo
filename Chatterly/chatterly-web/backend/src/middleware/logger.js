import winston from "winston";

const { combine, timestamp, printf } = winston.format;

// Custom format (optional)
const logFormat = printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

// 🚫 Filter OUT errors from combined.log
const ignoreErrors = winston.format((info) => {
  if (info.level === "error") {
    return false; // skip error logs
  }
  return info;
});

const logger = winston.createLogger({
  level: "info",
  format: combine(timestamp(), logFormat),
  transports: [
    
    new winston.transports.File({
      filename: "logs/combined.log",
      level: "info",
      format: combine(ignoreErrors(), timestamp(), logFormat),
    }),

    // ✅ Only errors
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
    }),

    // Console (optional)
    new winston.transports.Console(),
  ],
});

export default logger;