import metricsService from "../services/metricService.js";

const metricsMiddleware = (req, res, next) => {
  const startTime = Date.now();

  metricsService.recordRequest();
    
  res.on("finish", () => {
    const responseTime = Date.now() - startTime;
    
    metricsService.recordResponseTime(responseTime);
    
    if (res.statusCode >= 400) {
      metricsService.recordFailure();
    }
  });

  next();
};

export default metricsMiddleware;
