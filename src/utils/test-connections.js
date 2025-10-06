require('dotenv').config();
const ESSLService = require('../services/ESSLService');
const ZohoService = require('../services/ZohoService');
const logger = require('./logger');

async function testAllConnections() {
    console.log('🔧 eSSL to Zoho Sync - Connection Test\n');
    
    const esslService = new ESSLService();
    const zohoService = new ZohoService();
    
    console.log('=== Testing eSSL Connection ===');
    const esslResult = await esslService.testConnection();
    
    if (esslResult.success) {
        console.log('✅ SUCCESS:', esslResult.message);
        if (esslResult.method) {
            console.log(`   Connection method: ${esslResult.method}`);
        }
        if (esslResult.transactions && esslResult.transactions.length > 0) {
            console.log('Sample transactions:');
            esslResult.transactions.forEach((tx, index) => {
                console.log(`  ${index + 1}. Employee: ${tx.EmployeeCode}, Time: ${tx.PunchDate} ${tx.PunchTime}`);
            });
        }
        if (esslResult.warning) {
            console.log('⚠️  WARNING:', esslResult.warning);
        }
    } else {
        console.log('❌ FAILED:', esslResult.message || 'Unknown error');
        if (esslResult.details) {
            console.log('   Details:', JSON.stringify(esslResult.details, null, 2));
        }
    }
    
    console.log('\n=== Testing Zoho Connection ===');
    const zohoResult = await zohoService.testConnection();
    
    if (zohoResult.success) {
        console.log('✅ SUCCESS:', zohoResult.message || 'Connected successfully');
        if (zohoResult.employeeCount !== undefined) {
            console.log(`   Employees found: ${zohoResult.employeeCount}`);
        }
    } else {
        console.log('❌ FAILED:', zohoResult.error || zohoResult.message || 'Unknown error');
        if (zohoResult.details) {
            console.log('   Details:', zohoResult.details);
        }
        if (zohoResult.tokenInfo) {
            console.log('   Token Info:', {
                hasAccessToken: zohoResult.tokenInfo.hasAccessToken,
                hasRefreshToken: zohoResult.tokenInfo.hasRefreshToken,
                isValid: zohoResult.tokenInfo.isValid
            });
        }
    }
    
    console.log('\n=== Test Summary ===');
    if (esslResult.success && zohoResult.success) {
        console.log('🎉 All connections successful! System is ready for use.');
        console.log('\nNext steps:');
        console.log('1. Update employee mappings in src/config/employee-mapping.js');
        console.log('2. Start the service: npm run pm2:start');
        console.log('3. Monitor logs: npm run pm2:logs');
    } else {
        console.log('❌ Some connections failed. Please check:');
        if (!esslResult.success) {
            console.log('   - eSSL server URL and credentials');
            console.log('   - Network connectivity to eSSL server');
            console.log('   - eSSL API format (JSON vs SOAP)');
        }
        if (!zohoResult.success) {
            console.log('   - Zoho OAuth token validity');
            console.log('   - Zoho API permissions');
            console.log('   - Zoho API endpoints');
        }
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    testAllConnections();
}

module.exports = { testAllConnections };