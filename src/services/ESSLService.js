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
                    const actionsToTry = [
                        config.essl.soapActionGetTransactions || 'GetTransactionData',
                        config.essl.altSoapActionGetTransactions || 'GetTransactionDataJSON'
                    ];
                    const versionsToTry = ['1.1', '1.2'];
                    let soapResponse = null;
                    for (const act of actionsToTry) {
                        for (const ver of versionsToTry) {
                            const soapBody = this.buildSoapEnvelope(act, {
                                username: this.username,
                                password: this.password,
                                fromDate: fromTime,
                                toDate: toTime
                            }, ver);
                            try {
                                soapResponse = await axios.post(this.baseUrl, soapBody, {
                                    headers: this.soapHeaders(act, ver),
                                    timeout: config.essl.timeout
                                });
                                response = soapResponse;
                                break;
                            } catch (e) {
                                lastError = e;
                                continue;
                            }
                        }
                        if (response) break;
                    }
                    if (!response) throw lastError || jsonError;
                }

                const processingTime = Date.now() - startTime;
                if (response.status === 200 && response.data) {
                    const transactions = Array.isArray(response.data) ? response.data : [];
                    return transactions;
                } else {
                    lastError = new Error(`Unexpected response from eSSL: ${response.status}`);
                }
            } catch (error) {
                lastError = error;
                const status = error.response?.status;
                const body = this.safeStringify(error.response?.data);
                logger.error(`eSSL API Error: ${error.message} (status: ${status || 'N/A'}, body: ${body || 'N/A'})`);
            }

            if (this.shouldRetry(lastError)) {
                const backoffTime = this.calculateBackoff(attempt);
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
                const actionsToTry = [
                    config.essl.soapActionTestConnection || 'TestConnection',
                    config.essl.altSoapActionTestConnection || 'Ping'
                ];
                const versionsToTry = ['1.1', '1.2'];
                let soapResp = null;
                for (const act of actionsToTry) {
                    for (const ver of versionsToTry) {
                        const soapBody = this.buildSoapEnvelope(act, {
                            username: this.username,
                            password: this.password
                        }, ver);
                        try {
                            soapResp = await axios.post(this.baseUrl, soapBody, {
                                headers: this.soapHeaders(act, ver),
                                timeout: config.essl.timeout
                            });
                            response = soapResp;
                            break;
                        } catch (e) { continue; }
                    }
                    if (response) break;
                }
                if (!response) throw jsonError;
            }

            if (response.status === 200) {
                return { success: true, message: `Successfully connected to eSSL API using ${testMethod}`, method: testMethod, transactions: [] };
            } else {
                return { success: false, message: `eSSL API returned status ${response.status}` };
            }
        } catch (error) {
            const status = error.response?.status; const body = this.safeStringify(error.response?.data);
            return { success: false, message: `Failed to connect to eSSL API: ${error.message}`, details: { url: this.baseUrl, username: this.username, status, body } };
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

    soapHeaders(action, version) {
        if (version === '1.2') {
            return {
                'Content-Type': `application/soap+xml; charset=utf-8; action="http://tempuri.org/${action}"`,
                'User-Agent': 'ESSL-Zoho-Sync/1.0'
            };
        }
        return {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': `http://tempuri.org/${action}`,
            'User-Agent': 'ESSL-Zoho-Sync/1.0'
        };
    }

    buildSoapEnvelope(action, params, version) {
        const envelopeNs = version === '1.2' ? 'http://www.w3.org/2003/05/soap-envelope' : 'http://schemas.xmlsoap.org/soap/envelope/';
        return `<?xml version="1.0" encoding="utf-8"?>\n<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="${envelopeNs}">\n  <soap:Body>\n    <${action} xmlns="http://tempuri.org/">\n      ${Object.entries(params).map(([k,v])=>`<${k}>${v}</${k}>`).join('')}\n    </${action}>\n  </soap:Body>\n</soap:Envelope>`;
    }
}

module.exports = ESSLService;