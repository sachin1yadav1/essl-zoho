const moment = require('moment');

module.exports = {
    // Environment
    environment: process.env.NODE_ENV || 'development',
    
    // eSSL Configuration
    essl: {
        baseUrl: process.env.ESSL_BASE_URL || 'http://localhost:3366/WebAPIService.asmx',
        username: process.env.ESSL_USERNAME || 'essl',
        password: process.env.ESSL_PASSWORD || 'essl',
        // Adaptive polling configuration
        baseInterval: parseInt(process.env.ESSL_BASE_INTERVAL) || 20000, // 20 seconds
        maxInterval: parseInt(process.env.ESSL_MAX_INTERVAL) || 120000,  // 2 minutes
        minInterval: parseInt(process.env.ESSL_MIN_INTERVAL) || 10000,   // 10 seconds
        timeout: parseInt(process.env.ESSL_TIMEOUT) || 30000,
        maxRetries: parseInt(process.env.ESSL_MAX_RETRIES) || 3
    },

    // Zoho People Configuration
    zoho: {
        accessToken: process.env.ZOHO_ACCESS_TOKEN || 'your_zoho_oauth_token_here',
        apiUrl: process.env.ZOHO_API_URL || 'https://people.zoho.com/people/api/attendance',
        timeout: parseInt(process.env.ZOHO_TIMEOUT) || 15000,
        maxRetries: parseInt(process.env.ZOHO_MAX_RETRIES) || 3,
        rateLimitDelay: parseInt(process.env.ZOHO_RATE_LIMIT_DELAY) || 100
    },

    // Sync Configuration
    sync: {
        lastSyncTime: moment().subtract(1, 'hour').format('YYYY-MM-DD HH:mm:ss'),
        batchSize: parseInt(process.env.SYNC_BATCH_SIZE) || 10,
        maxBatchSize: parseInt(process.env.SYNC_MAX_BATCH_SIZE) || 50,
        timezone: process.env.TIMEZONE || 'Asia/Kolkata',
        // Adaptive polling thresholds
        emptyPollsToBackoff: parseInt(process.env.EMPTY_POLLS_BACKOFF) || 5,
        consecutiveErrorsToBackoff: parseInt(process.env.ERRORS_BACKOFF) || 3,
        backoffFactor: parseFloat(process.env.BACKOFF_FACTOR) || 1.5
    },

    // Performance Monitoring
    performance: {
        slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 5000, // 5 seconds
        memoryThreshold: parseFloat(process.env.MEMORY_THRESHOLD) || 0.8, // 80%
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 60000 // 1 minute
    },

    // Logging Configuration
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        syncLogPath: process.env.SYNC_LOG_PATH || './logs/sync.log',
        errorLogPath: process.env.ERROR_LOG_PATH || './logs/errors.log',
        debugLogPath: process.env.DEBUG_LOG_PATH || './logs/debug.log',
        performanceLogPath: process.env.PERFORMANCE_LOG_PATH || './logs/performance.log',
        maxFileSize: process.env.LOG_MAX_FILE_SIZE || '10m',
        maxFiles: process.env.LOG_MAX_FILES || '10'
    }
};