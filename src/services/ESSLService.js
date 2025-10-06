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

        try {
            logger.debug(`Fetching eSSL transactions from ${fromTime} to ${toTime}`);
            
            // eSSL API call to get transactions - try both JSON and SOAP formats
            let response;
            try {
                // Try JSON format first
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
                // If JSON fails, try SOAP format
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
                logger.warn(`Unexpected response from eSSL: ${response.status}`);
                this.failedRequests++;
                return [];
            }
            
        } catch (error) {
            this.failedRequests++;
            const errorTime = Date.now() - startTime;
            logger.error(`eSSL API Error after ${errorTime}ms: ${error.message}`);
            
            // Return empty array on error to prevent sync failure
            return [];
        }
    }

    async testConnection() {
        try {
            logger.debug('Testing eSSL connection...');
            
            // Try different test methods
            let response;
            let testMethod = 'JSON';
            
            try {
                // Method 1: Try JSON format
                response = await axios.post(this.baseUrl, {
                    username: this.username,
                    password: this.password
                }, {
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'ESSL-Zoho-Sync/1.0'
                    },
                    timeout: config.essl.timeout
                });
            } catch (jsonError) {
                testMethod = 'SOAP';
                // Method 2: Try SOAP format
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
                    // Method 3: Try simple GET request to check if server is reachable
                    testMethod = 'GET';
                    response = await axios.get(this.baseUrl, {
                        timeout: config.essl.timeout
                    });
                }
            }

            if (response.status === 200) {
                logger.success(`eSSL connection successful using ${testMethod} method`);
                
                // Try to get a small sample of recent transactions
                try {
                    const sampleTransactions = await this.getTransactions(
                        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
                        new Date().toISOString().slice(0, 19).replace('T', ' ')
                    );

                    return {
                        success: true,
                        message: `Successfully connected to eSSL API using ${testMethod}`,
                        method: testMethod,
                        transactions: sampleTransactions.slice(0, 3) // Return max 3 sample transactions
                    };
                } catch (transactionError) {
                    return {
                        success: true,
                        message: `Connected to eSSL API using ${testMethod}, but couldn't fetch transactions`,
                        method: testMethod,
                        warning: transactionError.message
                    };
                }
            } else {
                return {
                    success: false,
                    message: `eSSL API returned status ${response.status}`
                };
            }
            
        } catch (error) {
            logger.error(`eSSL connection test failed: ${error.message}`);
            return {
                success: false,
                message: `Failed to connect to eSSL API: ${error.message}`,
                details: {
                    url: this.baseUrl,
                    username: this.username,
                    error: error.response?.status || error.code || error.message
                }
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
}

module.exports = ESSLService;