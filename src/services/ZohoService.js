const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class ZohoService {
    constructor() {
        this.accessToken = config.zoho.accessToken;
        this.baseUrl = config.zoho.apiUrl;
        this.requestCount = 0;
        this.failedRequests = 0;
    }

    async sendAttendance(punchData, retryCount = 0) {
        const startTime = Date.now();
        this.requestCount++;

        try {
            const payload = this.buildPayload(punchData);
            
            logger.debug(`Sending to Zoho: ${punchData.zohoEmpId} at ${punchData.punchTime}`);
            
            const response = await axios.post(this.baseUrl, payload, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'ESSL-Zoho-Sync/1.0'
                },
                timeout: config.zoho.timeout
            });

            const processingTime = Date.now() - startTime;

            if (response.status === 200) {
                logger.success(`Punch synced for ${punchData.zohoEmpId} in ${processingTime}ms`);
                return { success: true, response: response.data, duration: processingTime };
            } else {
                logger.warn(`Unexpected response from Zoho: ${response.status}`);
                this.failedRequests++;
                return { success: false, error: `HTTP ${response.status}`, duration: processingTime };
            }
            
        } catch (error) {
            this.failedRequests++;
            const errorTime = Date.now() - startTime;
            const errorMessage = this.handleZohoError(error);
            
            logger.error(`Zoho API Error for ${punchData.zohoEmpId} after ${errorTime}ms: ${errorMessage}`);
            
            if (this.shouldRetry(error) && retryCount < config.zoho.maxRetries) {
                const backoffTime = this.calculateBackoff(retryCount);
                logger.warn(`Retrying Zoho request in ${backoffTime}ms...`);
                await this.delay(backoffTime);
                return this.sendAttendance(punchData, retryCount + 1);
            }
            
            return { success: false, error: errorMessage, duration: errorTime };
        }
    }

    buildPayload(punchData) {
        const params = new URLSearchParams();
        
        params.append('empId', punchData.zohoEmpId);
        params.append('checkIn', punchData.punchTime);
        params.append('comments', punchData.comments || 'Biometric Auto-Sync');
        
        if (punchData.checkOut) {
            params.append('checkOut', punchData.checkOut);
        }

        if (punchData.deviceId) {
            params.append('device', punchData.deviceId);
        }

        return params.toString();
    }

    handleZohoError(error) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
            
            switch(status) {
                case 401:
                    return 'Authentication failed - check access token';
                case 400:
                    return `Bad request: ${this.safeStringify(data)}`;
                case 404:
                    return 'Employee not found in Zoho - check employee mapping';
                case 429:
                    return 'Rate limit exceeded - too many requests';
                case 500:
                    return 'Zoho server error - try again later';
                default:
                    return `HTTP ${status}: ${this.safeStringify(data)}`;
            }
        } else if (error.request) {
            return 'No response from Zoho - check network connectivity';
        } else {
            return error.message;
        }
    }

    safeStringify(obj) {
        try {
            return JSON.stringify(obj);
        } catch {
            return String(obj);
        }
    }

    shouldRetry(error) {
        // Retry on network errors or server errors (5xx)
        if (!error.response) return true;
        return error.response.status >= 500;
    }

    calculateBackoff(retryCount) {
        // Exponential backoff with jitter
        const baseDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        const jitter = Math.random() * 1000;
        return baseDelay + jitter;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async testConnection() {
        try {
            const testUrl = `${this.baseUrl}?date=${new Date().toISOString().split('T')[0]}`;
            
            const response = await axios.get(testUrl, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
                    'User-Agent': 'ESSL-Zoho-Sync/1.0'
                },
                timeout: 10000
            });

            return {
                success: true,
                message: 'Successfully connected to Zoho People API'
            };
            
        } catch (error) {
            return {
                success: false,
                message: `Connection failed: ${this.handleZohoError(error)}`
            };
        }
    }

    getStats() {
        const successRate = this.requestCount > 0 ? 
            ((this.requestCount - this.failedRequests) / this.requestCount * 100).toFixed(1) : 100;
            
        return {
            totalRequests: this.requestCount,
            failedRequests: this.failedRequests,
            successRate: `${successRate}%`
        };
    }
}

module.exports = ZohoService;