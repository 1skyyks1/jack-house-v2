const { createServerAnalytics } = require('@jack-house-analytics/server-core');

let serverAnalytics = null;

const configureAnalytics = ({ appId, storage }) => {
    serverAnalytics = createServerAnalytics({
        appId,
        storage,
        flushIntervalMs: 5000,
        maxBatchSize: 50,
        maxQueueSize: 1000,
        onError: (error) => console.error('Failed to write server analytics:', error),
    });
    return serverAnalytics;
};

const trackOsuApiRequest = ({ operation, resourceId, source, userId }) => {
    serverAnalytics?.track({
        eventType: 'osu_api_request',
        userId,
        properties: {
            operation,
            source,
            ...(resourceId === undefined || resourceId === null ? {} : { resourceId: String(resourceId) }),
        },
    });
};

module.exports = {
    configureAnalytics,
    trackOsuApiRequest,
};
