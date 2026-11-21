let totalRequests = 0;
let failedRequests = 0;
let totalResponseTime = 0;
let slowQueries = 0

const recordRequest = () => {
    totalRequests++;
};

const recordFailure = () => {
    failedRequests++;
};

const recordResponseTime = (time) => {
    totalResponseTime += time;
};

const getAverageResponseTime = () => {
    if (totalRequests === 0)
        return 0;

    return Number((totalResponseTime / totalRequests).toFixed(2));
};

const recordSlowQuery = (duration) => {
    if (duration > 500) {
        slowQueries++;
    }
};

const getSlowQueryCount = () => slowQueries;

const getErrorRate = () => {
    if (totalRequests === 0)
        return 0;

    return Number(((failedRequests / totalRequests) * 100).toFixed(2));
};

const getMetrics = () => ({
    totalRequests,
    failedRequests,
    avgResponseTime: getAverageResponseTime(),
    errorRate: getErrorRate(),
});

const resetMetrics = () => {
    totalRequests = 0;
    failedRequests = 0;
    totalResponseTime = 0;
    slowQueries = 0;
};


export default {
    recordRequest,
    recordFailure,
    recordResponseTime,
    getAverageResponseTime,
    getErrorRate,
    getMetrics,
    resetMetrics,
    recordSlowQuery,
    getSlowQueryCount
};
