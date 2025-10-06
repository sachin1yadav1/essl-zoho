require('dotenv').config();
const ZohoService = require('../services/ZohoService');
const ZohoOAuthService = require('../services/ZohoOAuthService');
const logger = require('./logger');
const moment = require('moment');

class ZohoAPITester {
    constructor() {
        this.zohoService = new ZohoService();
        this.oauthService = new ZohoOAuthService();
    }

    async runAllTests() {
        logger.info('Starting comprehensive Zoho API tests...');
        
        const results = {
            oauth: await this.testOAuth(),
            connection: await this.testConnection(),
            employees: await this.testEmployees(),
            attendance: await this.testAttendance(),
            errorHandling: await this.testErrorHandling()
        };

        this.printTestResults(results);
        return results;
    }

    async testOAuth() {
        logger.info('Testing OAuth functionality...');
        
        const tests = {
            tokenInfo: null,
            tokenValidation: false,
            tokenRefresh: false
        };

        try {
            // Test token info
            tests.tokenInfo = this.oauthService.getTokenInfo();
            logger.info('Token Info:', tests.tokenInfo);

            // Test token validation
            tests.tokenValidation = this.oauthService.isTokenValid();
            logger.info(`Token validation: ${tests.tokenValidation}`);

            // Test token refresh (if refresh token available)
            if (tests.tokenInfo.hasRefreshToken && !tests.tokenValidation) {
                try {
                    await this.oauthService.refreshAccessToken();
                    tests.tokenRefresh = true;
                    logger.success('Token refresh successful');
                } catch (error) {
                    logger.error('Token refresh failed:', error.message);
                }
            }

        } catch (error) {
            logger.error('OAuth test error:', error.message);
        }

        return tests;
    }

    async testConnection() {
        logger.info('Testing Zoho API connection...');
        
        try {
            const result = await this.zohoService.testConnection();
            
            if (result.success) {
                logger.success('Connection test passed');
            } else {
                logger.error('Connection test failed:', result.error);
            }
            
            return result;

        } catch (error) {
            logger.error('Connection test error:', error.message);
            return { success: false, error: error.message };
        }
    }

    async testEmployees() {
        logger.info('Testing employee API endpoints...');
        
        const tests = {
            getAllEmployees: null,
            getSpecificEmployee: null
        };

        try {
            // Test get all employees
            const allEmployeesResult = await this.zohoService.getAllEmployees();
            tests.getAllEmployees = allEmployeesResult;
            
            if (allEmployeesResult.success) {
                logger.success(`Retrieved ${allEmployeesResult.data?.length || 0} employees`);
                
                // Test get specific employee (if employees exist)
                if (allEmployeesResult.data && allEmployeesResult.data.length > 0) {
                    const firstEmployee = allEmployeesResult.data[0];
                    const employeeId = firstEmployee.Employee_ID || firstEmployee.empId || firstEmployee.id;
                    
                    if (employeeId) {
                        const specificEmployeeResult = await this.zohoService.getEmployee(employeeId);
                        tests.getSpecificEmployee = specificEmployeeResult;
                        
                        if (specificEmployeeResult.success) {
                            logger.success(`Retrieved specific employee: ${employeeId}`);
                        } else {
                            logger.error('Failed to get specific employee:', specificEmployeeResult.error);
                        }
                    }
                }
            } else {
                logger.error('Failed to get all employees:', allEmployeesResult.error);
            }

        } catch (error) {
            logger.error('Employee test error:', error.message);
        }

        return tests;
    }

    async testAttendance() {
        logger.info('Testing attendance API endpoints...');
        
        const tests = {
            sendAttendance: null,
            getAttendance: null
        };

        try {
            // Test send attendance with mock data
            const mockPunchData = {
                zohoEmpId: 'TEST_EMP_001',
                punchTime: moment().format('DD-MMM-YYYY HH:mm'),
                checkOut: ''
            };

            const sendResult = await this.zohoService.sendAttendance(mockPunchData);
            tests.sendAttendance = sendResult;
            
            if (sendResult.success) {
                logger.success('Attendance send test passed');
            } else {
                logger.warn('Attendance send test failed (expected for test data):', sendResult.error);
            }

            // Test get attendance
            const fromDate = moment().subtract(7, 'days').format('DD-MMM-YYYY');
            const toDate = moment().format('DD-MMM-YYYY');
            
            const getResult = await this.zohoService.getAttendance('TEST_EMP_001', fromDate, toDate);
            tests.getAttendance = getResult;
            
            if (getResult.success) {
                logger.success('Attendance get test passed');
            } else {
                logger.warn('Attendance get test failed (expected for test data):', getResult.error);
            }

        } catch (error) {
            logger.error('Attendance test error:', error.message);
        }

        return tests;
    }

    async testErrorHandling() {
        logger.info('Testing error handling...');
        
        const tests = {
            invalidEmployee: null,
            invalidToken: null,
            networkTimeout: null
        };

        try {
            // Test invalid employee ID
            const invalidEmployeeResult = await this.zohoService.getEmployee('INVALID_EMP_ID_12345');
            tests.invalidEmployee = invalidEmployeeResult;
            
            // Test with temporarily invalid token (save current token)
            const currentToken = this.oauthService.accessToken;
            this.oauthService.accessToken = 'invalid_token_12345';
            
            const invalidTokenResult = await this.zohoService.getAllEmployees();
            tests.invalidToken = invalidTokenResult;
            
            // Restore valid token
            this.oauthService.accessToken = currentToken;

            logger.info('Error handling tests completed');

        } catch (error) {
            logger.error('Error handling test error:', error.message);
        }

        return tests;
    }

    printTestResults(results) {
        console.log('\n' + '='.repeat(60));
        console.log('ZOHO API TEST RESULTS');
        console.log('='.repeat(60));

        // OAuth Tests
        console.log('\n📋 OAuth Tests:');
        console.log(`  Token Available: ${results.oauth.tokenInfo?.hasAccessToken ? '✅' : '❌'}`);
        console.log(`  Token Valid: ${results.oauth.tokenValidation ? '✅' : '❌'}`);
        console.log(`  Refresh Token: ${results.oauth.tokenInfo?.hasRefreshToken ? '✅' : '❌'}`);

        // Connection Test
        console.log('\n🔗 Connection Test:');
        console.log(`  API Connection: ${results.connection.success ? '✅' : '❌'}`);
        if (!results.connection.success) {
            console.log(`  Error: ${results.connection.error}`);
        }

        // Employee Tests
        console.log('\n👥 Employee Tests:');
        console.log(`  Get All Employees: ${results.employees.getAllEmployees?.success ? '✅' : '❌'}`);
        console.log(`  Get Specific Employee: ${results.employees.getSpecificEmployee?.success ? '✅' : '❌'}`);

        // Attendance Tests
        console.log('\n⏰ Attendance Tests:');
        console.log(`  Send Attendance: ${results.attendance.sendAttendance?.success ? '✅' : '⚠️'}`);
        console.log(`  Get Attendance: ${results.attendance.getAttendance?.success ? '✅' : '⚠️'}`);

        // Error Handling Tests
        console.log('\n🛡️ Error Handling Tests:');
        console.log(`  Invalid Employee: ${!results.errorHandling.invalidEmployee?.success ? '✅' : '❌'}`);
        console.log(`  Invalid Token: ${!results.errorHandling.invalidToken?.success ? '✅' : '❌'}`);

        // Overall Status
        const overallSuccess = results.connection.success && 
                              results.oauth.tokenInfo?.hasAccessToken &&
                              results.employees.getAllEmployees?.success;

        console.log('\n🎯 Overall Status:');
        console.log(`  Zoho API Ready: ${overallSuccess ? '✅ YES' : '❌ NO'}`);

        if (!overallSuccess) {
            console.log('\n📝 Next Steps:');
            if (!results.oauth.tokenInfo?.hasAccessToken) {
                console.log('  1. Run OAuth authorization: npm run oauth:start');
                console.log('  2. Open http://localhost:3000 in your browser');
                console.log('  3. Complete the authorization process');
            }
            if (!results.connection.success) {
                console.log('  1. Check your Zoho API credentials');
                console.log('  2. Verify your network connection');
                console.log('  3. Check Zoho API status');
            }
        }

        console.log('\n' + '='.repeat(60));
    }

    async testSpecificEndpoint(endpoint, params = {}) {
        logger.info(`Testing specific endpoint: ${endpoint}`);
        
        try {
            switch (endpoint) {
                case 'employees':
                    return await this.zohoService.getAllEmployees();
                
                case 'employee':
                    if (!params.id) throw new Error('Employee ID required');
                    return await this.zohoService.getEmployee(params.id);
                
                case 'attendance':
                    if (!params.empId || !params.fromDate || !params.toDate) {
                        throw new Error('Employee ID, fromDate, and toDate required');
                    }
                    return await this.zohoService.getAttendance(params.empId, params.fromDate, params.toDate);
                
                case 'send-attendance':
                    if (!params.punchData) throw new Error('Punch data required');
                    return await this.zohoService.sendAttendance(params.punchData);
                
                default:
                    throw new Error(`Unknown endpoint: ${endpoint}`);
            }

        } catch (error) {
            logger.error(`Endpoint test failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

// CLI interface
if (require.main === module) {
    const tester = new ZohoAPITester();
    
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'all':
            tester.runAllTests();
            break;
        
        case 'oauth':
            tester.testOAuth().then(result => console.log(result));
            break;
        
        case 'connection':
            tester.testConnection().then(result => console.log(result));
            break;
        
        case 'employees':
            tester.testEmployees().then(result => console.log(result));
            break;
        
        case 'attendance':
            tester.testAttendance().then(result => console.log(result));
            break;
        
        default:
            console.log('Usage: node test-zoho-api.js [all|oauth|connection|employees|attendance]');
            tester.runAllTests();
    }
}

module.exports = ZohoAPITester;