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
                
                // Try JSON API first with correct method
                try {
                    response = await axios.post(this.baseUrl + '/GetDeviceLogData', {
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
                    // If JSON fails, try SOAP with GetDeviceLogData method
                    await this.ensureSoapMeta();
                    const ns = this.soapNs || config.essl.soapNs || 'http://tempuri.org/';
                    
                    // Use the correct eSSL API method for device log data
                    const methodsToTry = [
                        {
                            action: 'GetDeviceLogData',
                            params: {
                                UserName: this.username,
                                Password: this.password,
                                FromDate: fromTime,
                                ToDate: toTime
                            }
                        }
                    ];
                    
                    const versionsToTry = ['1.1', '1.2'];
                    let soapResponse = null;
                    
                    for (const method of methodsToTry) {
                        for (const ver of versionsToTry) {
                            const hdrs = this.soapHeaders(method.action, ver, ns);
                            logger.info(`SOAP attempt: action=${method.action}, version=${ver}, params=${JSON.stringify(method.params)}`);
                            
                            const soapBody = this.buildSoapEnvelope(method.action, method.params, ver);
                            try {
                                soapResponse = await axios.post(this.soapEndpoint(), soapBody, {
                                    headers: hdrs,
                                    timeout: config.essl.timeout
                                });
                                response = soapResponse;
                                logger.info(`SUCCESS: GetDeviceLogData working with SOAP ${ver} - Ready for Zoho sync!`);
                                break;
                            } catch (e) { 
                                logger.error(`SOAP failed: action=${method.action}, version=${ver}: ${e.message}`);
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
                    // Parse the response data to extract attendance logs
                    let transactions = [];
                    
                    if (Array.isArray(response.data)) {
                        transactions = response.data;
                    } else if (response.data && typeof response.data === 'object') {
                        // Handle SOAP response structure
                        const soapData = response.data;
                        if (soapData.GetDeviceLogDataResult) {
                            transactions = Array.isArray(soapData.GetDeviceLogDataResult) 
                                ? soapData.GetDeviceLogDataResult 
                                : [soapData.GetDeviceLogDataResult];
                        }
                    }
                    
                    logger.info(`Retrieved ${transactions.length} attendance logs in ${processingTime}ms`);
                    logger.info(`Sample log data structure:`, transactions.length > 0 ? transactions[0] : 'No data');
                    
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
            let response; 
            let testMethod = 'JSON';
            
            // Try JSON API first
            try {
                response = await axios.post(this.baseUrl + '/GetEmployeeCodes', {
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
                await this.ensureSoapMeta();
                const ns = this.soapNs || config.essl.soapNs || 'http://tempuri.org/';
                
                // Use GetEmployeeCodes method as per eSSL documentation
                const testCombinations = [
                    { 
                        action: 'GetEmployeeCodes', 
                        params: { 
                            UserName: this.username, 
                            Password: this.password,
                            EmployeeLocation: '' // Empty string for all locations
                        } 
                    },
                    { 
                        action: 'TestConnection', 
                        params: { 
                            UserName: this.username, 
                            Password: this.password
                        } 
                    },
                    { 
                        action: 'Ping', 
                        params: { 
                            UserName: this.username, 
                            Password: this.password
                        } 
                    }
                ];
                
                const versionsToTry = ['1.1', '1.2'];
                let soapResp = null;
                
                for (const combo of testCombinations) {
                    for (const ver of versionsToTry) {
                        const soapBody = this.buildSoapEnvelope(combo.action, combo.params, ver);
                        const headers = this.soapHeaders(combo.action, ver, ns);
                        
                        logger.info(`SOAP test: action=${combo.action}, version=${ver}`);
                        
                        try {
                            soapResp = await axios.post(this.soapEndpoint(), soapBody, {
                                headers: headers,
                                timeout: config.essl.timeout
                            });
                            response = soapResp;
                            logger.info(`SOAP success with action=${combo.action}, version=${ver}`);
                            break;
                        } catch (e) { 
                            logger.error(`SOAP failed: action=${combo.action}, version=${ver}: ${e.message}`);
                            continue; 
                        }
                    }
                    if (response) break;
                }
                if (!response) throw jsonError;
            }

            if (response.status === 200) {
                return { 
                    success: true, 
                    message: `Successfully connected to eSSL API using ${testMethod}`, 
                    method: testMethod, 
                    transactions: [] 
                };
            } else {
                return { 
                    success: false, 
                    message: `eSSL API returned status ${response.status}` 
                };
            }
        } catch (error) {
            const status = error.response?.status; 
            const body = this.safeStringify(error.response?.data);
            return { 
                success: false, 
                message: `Failed to connect to eSSL API: ${error.message}`, 
                details: { 
                    url: this.baseUrl, 
                    username: this.username, 
                    status, 
                    body 
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

    soapHeaders(action, version, ns = 'http://tempuri.org/') {
        const namespacedAction = ns.endsWith('/') ? `${ns}${action}` : `${ns}/${action}`;
        const headerStyle = config.essl.soapHeaderStyle || 'namespaced';
        
        if (version === '1.2') {
            return {
                'Content-Type': `application/soap+xml; charset=utf-8; action="${namespacedAction}"`,
                'User-Agent': 'ESSL-Zoho-Sync/1.0'
            };
        }
        return {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': headerStyle === 'empty' ? '""' : `"${namespacedAction}"`,
            'User-Agent': 'ESSL-Zoho-Sync/1.0'
        };
    }

    buildSoapEnvelope(action, params, version) {
        const ns = this.soapNs || config.essl.soapNs || 'http://tempuri.org/';
        
        if (version === '1.2') {
            const body = Object.entries(params)
                .map(([k, v]) => `      <${k}>${this.escapeXml(v)}</${k}>`).join('\n');
            
            return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <${action} xmlns="${ns}">
${body}
    </${action}>
  </soap12:Body>
</soap12:Envelope>`;
        } else {
            const body = Object.entries(params)
                .map(([k, v]) => `      <${k}>${this.escapeXml(v)}</${k}>`).join('\n');
            
            return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <${action} xmlns="${ns}">
${body}
    </${action}>
  </soap:Body>
</soap:Envelope>`;
        }
    }

    escapeXml(unsafe) {
        if (typeof unsafe !== 'string') return unsafe;
        return unsafe.replace(/[<>&'"]/g, function (c) {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
        });
    }

    soapEndpoint() {
        const cfg = config.essl.soapEndpoint;
        if (cfg) return cfg;
        if (!this.baseUrl.endsWith('.asmx')) {
            return this.baseUrl.replace(/\/$/, '') + '/Service.asmx';
        }
        return this.baseUrl;
    }

    async ensureSoapMeta() {
        if (this.soapNs && this.soapActionMap) return;
        
        if (config.essl.soapNs) this.soapNs = config.essl.soapNs;
        this.soapActionMap = this.soapActionMap || {};
        
        try {
            const wsdlUrl = `${this.soapEndpoint()}?wsdl`;
            logger.info(`Fetching WSDL from: ${wsdlUrl}`);
            const resp = await axios.get(wsdlUrl, { timeout: config.essl.timeout });
            const wsdl = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
            
            // Extract targetNamespace
            const nsMatch = wsdl.match(/targetNamespace="([^"]+)"/);
            if (nsMatch) this.soapNs = nsMatch[1];
            
            // Extract available operations
            const operationMatches = wsdl.match(/<operation[^>]*name="([^"]+)"/gi);
            if (operationMatches) {
                const operations = operationMatches.map(m => m.match(/name="([^"]+)"/)[1]);
                logger.info(`Available WSDL operations: ${operations.join(', ')}`);
                
                // Look for device log methods specifically
                const deviceLogMethods = operations.filter(op => 
                    op.toLowerCase().includes('devicelog') || 
                    op.toLowerCase().includes('device') ||
                    op.toLowerCase().includes('log') || 
                    op.toLowerCase().includes('attendance')
                );
                logger.info(`Found device/log methods: ${deviceLogMethods.join(', ')}`);
                
                // Check if GetDeviceLogData is available
                const hasGetDeviceLogData = operations.some(op => 
                    op.toLowerCase() === 'getdevicelogdata'
                );
                logger.info(`GetDeviceLogData available: ${hasGetDeviceLogData}`);
            }
            
            // Map essential methods for Zoho sync
            const essentialMethods = ['GetDeviceLogData', 'GetEmployeeCodes'];
            for (const method of essentialMethods) {
                this.soapActionMap[method] = this.parseWsdlFor(wsdl, method) || this.soapActionMap[method];
            }
            
        } catch (e) {
            logger.error(`WSDL discovery failed: ${e.message}`);
        }
    }

    parseWsdlFor(wsdl, opName) {
        // Try SOAP 1.1 style
        let m = wsdl.match(new RegExp(`<operation[^>]*name=\"${opName}\"[\s\S]*?<soap:operation[^>]*soapAction=\"([^\"]+)\"`, 'i'));
        if (m && m[1]) return m[1];
        
        // Try SOAP 1.2 style
        m = wsdl.match(new RegExp(`<operation[^>]*name=\"${opName}\"[\s\S]*?<soap12:operation[^>]*soapAction=\"([^\"]+)\"`, 'i'));
        if (m && m[1]) return m[1];
        
        return null;
    }
}

module.exports = ESSLService;