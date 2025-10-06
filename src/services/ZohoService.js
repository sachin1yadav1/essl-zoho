const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');
const ZohoOAuthService = require('./ZohoOAuthService');

class ZohoService {
    constructor() {
        this.oauthService = new ZohoOAuthService();
        this.baseUrl = config.zoho.apiUrl;
        this.attendanceUrl = config.zoho.attendanceApiUrl || 'https://people.zoho.in/people/api/attendance';
        this.employeeUrl = config.zoho.employeeApiUrl || 'https://people.zoho.in/api/forms/P_EmployeeView/records';
        this.requestCount = 0;
        this.failedRequests = 0;
        this.rateLimitReset = null;
    }

    /**
     * Send attendance data to Zoho People
     */
    async sendAttendance(punchData, retryCount = 0) {
        const startTime = Date.now();
        this.requestCount++;

        try {
            // Get valid access token
            const accessToken = await this.oauthService.getValidAccessToken();
            
            // Build query parameters for the attendance API
            const queryParams = this.buildAttendanceParams(punchData);
            const url = `${this.attendanceUrl}?${queryParams}`;
            
            logger.debug(`Sending to Zoho: ${punchData.zohoEmpId} at ${punchData.punchTime}`);
            
            const response = await axios.post(url, null, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'ESSL-Zoho-Sync/2.0'
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
                logger.info(`Retrying in ${backoffTime}ms (attempt ${retryCount + 1}/${config.zoho.maxRetries})`);
                
                await this.delay(backoffTime);
                return this.sendAttendance(punchData, retryCount + 1);
            }
            
            return { success: false, error: errorMessage, duration: errorTime };
        }
    }

    /**
     * Get employee details from Zoho People
     */
    async getEmployee(employeeId) {
        const accessToken = await this.oauthService.getValidAccessToken();
        const params = new URLSearchParams({ searchField: 'Employee_ID', searchValue: employeeId });
        try {
            const response = await axios.get(`${this.employeeUrl}?${params.toString()}`, {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            });
            const data = response.data;
            let zohoErr = data?.response?.errors ?? data?.errors;
            if (Array.isArray(zohoErr)) zohoErr = zohoErr[0];
            if (zohoErr?.code && zohoErr?.message) {
                return { success: false, error: `Zoho error ${zohoErr.code}: ${zohoErr.message}`, data };
            }
            return { success: true, data };
        } catch (error) {
            return { success: false, error: this.handleZohoError(error) };
        }
    }

    /**
     * Get all employees from Zoho People
     */
    async getAllEmployees() {
        const accessToken = await this.oauthService.getValidAccessToken();
        const body = new URLSearchParams();
        try {
            const response = await axios.post(this.employeeUrl, body.toString(), {
                headers: {
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 15000
            });
            const data = response.data;
            let zohoErr = data?.response?.errors ?? data?.errors;
            if (Array.isArray(zohoErr)) zohoErr = zohoErr[0];
            if (zohoErr?.code && zohoErr?.message) {
                return { success: false, error: `Zoho error ${zohoErr.code}: ${zohoErr.message}`, data };
            }
            return { success: true, data: Array.isArray(data) ? data : (data?.response?.result || []) };
        } catch (error) {
            if (error.response?.status === 401) {
                try {
                    await this.oauthService.refreshAccessToken();
                    return await this.getAllEmployees();
                } catch (refreshError) {
                    return { success: false, error: this.handleZohoError(refreshError) };
                }
            }
            return { success: false, error: this.handleZohoError(error) };
        }
    }

    /**
     * Get attendance records from Zoho People
     */
    async getAttendance(employeeId, fromDate, toDate) {
        try {
            const accessToken = await this.oauthService.getValidAccessToken();
            const params = new URLSearchParams({ empId: employeeId, fromDate, toDate });
            const response = await axios.get(`${this.attendanceUrl}?${params.toString()}`, {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'User-Agent': 'ESSL-Zoho-Sync/2.0'
                },
                timeout: config.zoho.timeout
            });

            return { success: true, data: response.data };

        } catch (error) {
            const errorMessage = this.handleZohoError(error);
            logger.error(`Failed to get attendance for ${employeeId}: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    buildAttendanceParams(punchData) {
        // Format the date and time according to Zoho People API requirements
        // Expected format: dd/MM/yyyy HH:mm:ss
        const punchDate = new Date(punchData.punchTime);
        const formattedDateTime = this.formatDateTimeForZoho(punchDate);
        
        const params = new URLSearchParams({
            empId: punchData.zohoEmpId,
            dateFormat: 'dd/MM/yyyy HH:mm:ss',
            checkIn: formattedDateTime
        });

        // Add checkout time if available
        if (punchData.checkOut) {
            const checkOutDate = new Date(punchData.checkOut);
            const formattedCheckOut = this.formatDateTimeForZoho(checkOutDate);
            params.append('checkOut', formattedCheckOut);
        }

        return params.toString();
    }

    formatDateTimeForZoho(date) {
        // Format date as dd/MM/yyyy HH:mm:ss
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    }

    buildPayload(punchData) {
        // Keep the old method for backward compatibility
        const payload = new URLSearchParams({
            empId: punchData.zohoEmpId,
            dateFormat: 'dd-MMM-yyyy',
            timeFormat: 'HH:mm',
            checkIn: punchData.punchTime,
            checkOut: punchData.checkOut || ''
        });

        return payload;
    }

    handleZohoError(error) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;
    
            // Robustly parse Zoho People payloads (object or array)
            let zohoErr = data?.response?.errors ?? data?.errors ?? null;
            if (Array.isArray(zohoErr)) {
                zohoErr = zohoErr[0];
            }
            if (zohoErr?.code && zohoErr?.message) {
                return `Zoho error ${zohoErr.code}: ${zohoErr.message}`;
            }
    
            if (status === 429) {
                const retryAfter = error.response.headers['retry-after'];
                if (retryAfter) {
                    this.rateLimitReset = Date.now() + (parseInt(retryAfter) * 1000);
                }
                return `Rate limited. Retry after: ${retryAfter || 'unknown'}`;
            }
            if (status === 401) {
                return 'Authentication failed. Token may be expired.';
            }
            if (status === 403) {
                return 'Access forbidden. Check API permissions.';
            }
            if (status === 404) {
                return 'API endpoint not found.';
            }
            if (status >= 500) {
                return `Zoho server error: ${status}`;
            }
            return `HTTP ${status}: ${this.safeStringify(data)}`;
        } else if (error.request) {
            return 'Network error: No response from Zoho';
        } else {
            return `Request error: ${error.message}`;
        }
    }

    safeStringify(obj) {
        try {
            return JSON.stringify(obj);
        } catch (e) {
            return String(obj);
        }
    }

    shouldRetry(error) {
        if (!error.response) return true; // Network errors
        const status = error.response.status;
        return status >= 500 || status === 429; // Server errors or rate limiting
    }

    calculateBackoff(retryCount) {
        const baseDelay = config.zoho.rateLimitDelay;
        return Math.min(baseDelay * Math.pow(2, retryCount), 30000); // Max 30 seconds
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async testConnection() {
        try {
            logger.info('Testing Zoho People API connection...');
            
            // Check if we have valid tokens
            const tokenInfo = this.oauthService.getTokenInfo();
            if (!tokenInfo.hasAccessToken) {
                return {
                    success: false,
                    error: 'No access token available. Please authorize first.',
                    details: tokenInfo
                };
            }

            if (!tokenInfo.isValid) {
                logger.info('Token expired, attempting to refresh...');
                try {
                    await this.oauthService.refreshAccessToken();
                } catch (refreshError) {
                    return {
                        success: false,
                        error: 'Token expired and refresh failed. Please re-authorize.',
                        details: refreshError.message
                    };
                }
            }

            // Test API call - get employees
            logger.info(`Testing employee API endpoint: ${this.employeeUrl}`);
            const result = await this.getAllEmployees();
            
            if (result.success) {
                logger.success('Zoho People API connection successful');
                return {
                    success: true,
                    message: 'Connected to Zoho People API',
                    tokenInfo: tokenInfo,
                    employeeCount: result.data?.response?.result?.length || result.data?.length || 0,
                    apiEndpoint: this.employeeUrl
                };
            } else {
                return {
                    success: false,
                    error: result.error,
                    tokenInfo: tokenInfo,
                    apiEndpoint: this.employeeUrl
                };
            }

        } catch (error) {
            logger.error('Zoho connection test failed:', error.message);
            return {
                success: false,
                error: error.message,
                tokenInfo: this.oauthService.getTokenInfo(),
                apiEndpoint: this.employeeUrl
            };
        }
    }

    getStats() {
        return {
            requestCount: this.requestCount,
            failedRequests: this.failedRequests,
            successRate: this.requestCount > 0 ? 
                ((this.requestCount - this.failedRequests) / this.requestCount * 100).toFixed(2) + '%' : 
                '0%',
            rateLimitReset: this.rateLimitReset,
            tokenInfo: this.oauthService.getTokenInfo()
        };
    }

    // OAuth helper methods
    getAuthorizationUrl() {
        return this.oauthService.getAuthorizationUrl();
    }

    async exchangeCodeForToken(authCode) {
        return await this.oauthService.exchangeCodeForToken(authCode);
    }

    async revokeToken() {
        return await this.oauthService.revokeToken();
    }
}

module.exports = ZohoService;