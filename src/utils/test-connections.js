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
        if (esslResult.transactions && esslResult.transactions.length > 0) {
            console.log('Sample transactions:');
            esslResult.transactions.forEach((tx, index) => {
                console.log(`  ${index + 1}. Employee: ${tx.EmployeeCode}, Time: ${tx.PunchDate} ${tx.PunchTime}`);
            });
        }
    } else {
        console.log('❌ FAILED:', esslResult.message);
    }
    
    console.log('\n=== Testing Zoho Connection ===');
    const zohoResult = await zohoService.testConnection();
    
    if (zohoResult.success) {
        console.log('✅ SUCCESS:', zohoResult.message);
    } else {
        console.log('❌ FAILED:', zohoResult.message);
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
        }
        if (!zohoResult.success) {
            console.log('   - Zoho OAuth token validity');
            console.log('   - Zoho API permissions');
        }
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    testAllConnections();
}

module.exports = { testAllConnections };