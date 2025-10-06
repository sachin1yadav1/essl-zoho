const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class ESSLService {
    constructor() {
        this.baseUrl = config.essl.baseUrl;
        this.username = config.essl.username;
        this.password = config.essl.password;
        this.requestCount = 0;
        this.failedRequests = 0;
    }

    async getTransactions(fromTime, toTime) {
        const startTime = Date.now();
        this.requestCount++;

        let lastError = null;
        for (let attempt = 0; attempt < config.essl.maxRetries; attempt++) {
            try {
                logger.debug(`Fetching eSSL transactions from ${fromTime} to ${toTime} (attempt ${attempt + 1})`);
                let response;
                try {
                    response = await axios.post(this.baseUrl + '/GetTransactionData', {
                        username: this.username,
                        password: this.password,
                        fromDate: fromTime,
                        toDate: toTime
                    }, {
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'ESSL-Zoho-Sync/1.0'
                        },
                        timeout: config.essl.timeout
                    });
                } catch (jsonError) {
                    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
                <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                    <soap:Body>
                        <GetTransactionData xmlns="http://tempuri.org/">
                            <username>${this.username}</username>
                            <password>${this.password}</password>
                            <fromDate>${fromTime}</fromDate>
                            <toDate>${toTime}</toDate>
                        </GetTransactionData>
                    </soap:Body>
                </soap:Envelope>`;
                    response = await axios.post(this.baseUrl, soapBody, {
                        headers: {
                            'Content-Type': 'text/xml; charset=utf-8',
                            'SOAPAction': 'http://tempuri.org/GetTransactionData',
                            'User-Agent': 'ESSL-Zoho-Sync/1.0'
                        },
                        timeout: config.essl.timeout
                    });
                }

                const processingTime = Date.now() - startTime;
                if (response.status === 200 && response.data) {
                    const transactions = Array.isArray(response.data) ? response.data : [];
                    logger.debug(`Retrieved ${transactions.length} transactions in ${processingTime}ms`);
                    return transactions;
                } else {
                    lastError = new Error(`Unexpected response from eSSL: ${response.status}`);
                    logger.warn(`Unexpected response from eSSL: ${response.status}`);
                }
            } catch (error) {
                lastError = error;
                const errorTime = Date.now() - startTime;
                const status = error.response?.status;
                const body = this.safeStringify(error.response?.data);
                logger.error(`eSSL API Error after ${errorTime}ms: ${error.message} (status: ${status || 'N/A'}, body: ${body || 'N/A'})`);
            }

            // Retry if server error or network error
            if (this.shouldRetry(lastError)) {
                const backoffTime = this.calculateBackoff(attempt);
                logger.info(`Retrying eSSL in ${backoffTime}ms (attempt ${attempt + 2}/${config.essl.maxRetries})`);
                await this.delay(backoffTime);
                continue;
            }
            break;
        }

        this.failedRequests++;
        return [];
    }

    async testConnection() {
        try {
            logger.debug('Testing eSSL connection...');
            let response; let testMethod = 'JSON';
            try {
                response = await axios.post(this.baseUrl, {
                    username: this.username,
                    password: this.password
                }, {
                    headers: { 'Content-Type': 'application/json', 'User-Agent': 'ESSL-Zoho-Sync/1.0' },
                    timeout: config.essl.timeout
                });
            } catch (jsonError) {
                testMethod = 'SOAP';
                const soapBody = `<?xml version="1.0" encoding="utf-8"?>
                <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                    <soap:Body>
                        <TestConnection xmlns="http://tempuri.org/">
                            <username>${this.username}</username>
                            <password>${this.password}</password>
                        </TestConnection>
                    </soap:Body>
                </soap:Envelope>`;
                try {
                    response = await axios.post(this.baseUrl, soapBody, {
                        headers: {
                            'Content-Type': 'text/xml; charset=utf-8',
                            'SOAPAction': 'http://tempuri.org/TestConnection',
                            'User-Agent': 'ESSL-Zoho-Sync/1.0'
                        },
                        timeout: config.essl.timeout
                    });
                } catch (soapError) {
                    testMethod = 'GET';
                    response = await axios.get(this.baseUrl, { timeout: config.essl.timeout });
                }
            }

            if (response.status === 200) {
                logger.success(`eSSL connection successful using ${testMethod} method`);
                try {
                    const sampleTransactions = await this.getTransactions(
                        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
                        new Date().toISOString().slice(0, 19).replace('T', ' ')
                    );
                    return { success: true, message: `Successfully connected to eSSL API using ${testMethod}`, method: testMethod, transactions: sampleTransactions.slice(0, 3) };
                } catch (transactionError) {
                    return { success: true, message: `Connected to eSSL API using ${testMethod}, but couldn't fetch transactions`, method: testMethod, warning: transactionError.message };
                }
            } else {
                return { success: false, message: `eSSL API returned status ${response.status}` };
            }
        } catch (error) {
            const status = error.response?.status;
            const body = this.safeStringify(error.response?.data);
            logger.error(`eSSL connection test failed: ${error.message} (status: ${status || 'N/A'}, body: ${body || 'N/A'})`);
            return {
                success: false,
                message: `Failed to connect to eSSL API: ${error.message}`,
                details: { url: this.baseUrl, username: this.username, status, body }
            };
        }
    }

    getStats() {
        return {
            requestCount: this.requestCount,
            failedRequests: this.failedRequests,
            successRate: this.requestCount > 0 ? 
                ((this.requestCount - this.failedRequests) / this.requestCount * 100).toFixed(2) + '%' : 
                'N/A',
            baseUrl: this.baseUrl
        };
    }

    shouldRetry(error) {
        if (!error || !error.response) return true; // network or unknown
        const status = error.response.status;
        return status >= 500 || status === 429;
    }

    calculateBackoff(retryCount) {
        const baseDelay = 1000; // 1s base
        return Math.min(baseDelay * Math.pow(2, retryCount), 15000); // cap at 15s
    }

    safeStringify(obj) {
        try { return JSON.stringify(obj); } catch { return String(obj); }
    }

    delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
}

module.exports = ESSLService;