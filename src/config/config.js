const moment = require('moment');

module.exports = {
    // Environment
    environment: process.env.NODE_ENV || 'development',
    
    // eSSL Configuration
    essl: {
        baseUrl: process.env.ESSL_BASE_URL || 'http://ebioservernew.esslsecurity.com:99/webservice.asmx',
        username: process.env.ESSL_USERNAME || 'essl',
        password: process.env.ESSL_PASSWORD || 'essl',
        // Adaptive polling configuration
        baseInterval: parseInt(process.env.ESSL_BASE_INTERVAL) || 20000, // 20 seconds
        maxInterval: parseInt(process.env.ESSL_MAX_INTERVAL) || 120000,  // 2 minutes
        minInterval: parseInt(process.env.ESSL_MIN_INTERVAL) || 10000,   // 10 seconds
        timeout: parseInt(process.env.ESSL_TIMEOUT) || 30000,
        maxRetries: parseInt(process.env.ESSL_MAX_RETRIES) || 3,
        soapEndpoint: process.env.ESSL_SOAP_ENDPOINT, // e.g. http://host/webservice.asmx
        soapNs: process.env.ESSL_SOAP_NS || 'http://tempuri.org/',
        soapHeaderStyle: process.env.ESSL_SOAP_HEADER_STYLE || 'namespaced',
        soapActionGetTransactions: process.env.ESSL_SOAP_ACTION_GET || 'GetTransactionData',
        altSoapActionGetTransactions: process.env.ESSL_ALT_SOAP_ACTION_GET || 'GetTransactionData', // Remove JSON variant
        soapActionTestConnection: process.env.ESSL_SOAP_ACTION_TEST || 'GetEmployeeCodes', // Use working method
        altSoapActionTestConnection: process.env.ESSL_ALT_SOAP_ACTION_TEST || 'GetEmployeeCodes'
       
    },

    // Zoho People Configuration
    zoho: {
        // OAuth Configuration
        oauth: {
            clientId: process.env.ZOHO_CLIENT_ID,
            clientSecret: process.env.ZOHO_CLIENT_SECRET,
            redirectUri: process.env.ZOHO_REDIRECT_URI || 'http://localhost:3000/oauth/callback',
            scope: process.env.ZOHO_SCOPE || 'ZohoPeople.attendance.ALL,ZohoPeople.forms.READ,ZohoPeople.employee.READ',
            accountsUrl: process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in',
            accessToken: process.env.ZOHO_ACCESS_TOKEN,
            refreshToken: process.env.ZOHO_REFRESH_TOKEN,
            tokenExpiresAt: process.env.ZOHO_TOKEN_EXPIRES_AT
        },
        
        // API Configuration - Updated with specific endpoints
        apiUrl: process.env.ZOHO_API_BASE_URL || 'https://people.zoho.in/people/api',
        attendanceApiUrl: process.env.ZOHO_ATTENDANCE_API_URL || 'https://people.zoho.in/people/api/attendance',
        employeeApiUrl: process.env.ZOHO_EMPLOYEE_API_URL || 'https://people.zoho.in/api/forms/P_EmployeeView/records',
        timeout: parseInt(process.env.ZOHO_TIMEOUT) || 15000,
        maxRetries: parseInt(process.env.ZOHO_MAX_RETRIES) || 3,
        rateLimitDelay: parseInt(process.env.ZOHO_RATE_LIMIT_DELAY) || 100,
        
        // OAuth Server Configuration
        oauthServer: {
            port: parseInt(process.env.OAUTH_SERVER_PORT) || 3000,
            host: process.env.OAUTH_SERVER_HOST || 'localhost'
        }
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