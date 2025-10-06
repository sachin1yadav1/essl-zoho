require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class ZohoSetup {
    constructor() {
        this.envPath = path.join(process.cwd(), '.env');
    }

    async checkSetup() {
        logger.info('Checking Zoho API setup...');
        
        const checks = {
            envFile: await this.checkEnvFile(),
            credentials: await this.checkCredentials(),
            dependencies: await this.checkDependencies()
        };

        this.printSetupStatus(checks);
        return checks;
    }

    async checkEnvFile() {
        try {
            await fs.access(this.envPath);
            const content = await fs.readFile(this.envPath, 'utf8');
            
            const requiredVars = [
                'ZOHO_CLIENT_ID',
                'ZOHO_CLIENT_SECRET',
                'ZOHO_REDIRECT_URI',
                'ZOHO_SCOPE'
            ];

            const missingVars = requiredVars.filter(varName => 
                !content.includes(`${varName}=`) || 
                content.includes(`${varName}=your_`) ||
                content.includes(`${varName}=`)
            );

            return {
                exists: true,
                hasRequiredVars: missingVars.length === 0,
                missingVars
            };

        } catch (error) {
            return {
                exists: false,
                hasRequiredVars: false,
                missingVars: ['All variables missing']
            };
        }
    }

    async checkCredentials() {
        try {
            const content = await fs.readFile(this.envPath, 'utf8');
            
            const hasClientId = content.includes('ZOHO_CLIENT_ID=') && 
                               !content.includes('ZOHO_CLIENT_ID=your_');
            const hasClientSecret = content.includes('ZOHO_CLIENT_SECRET=') && 
                                   !content.includes('ZOHO_CLIENT_SECRET=your_');
            const hasTokens = content.includes('ZOHO_ACCESS_TOKEN=') && 
                             content.match(/ZOHO_ACCESS_TOKEN=.+/);

            return {
                hasClientId,
                hasClientSecret,
                hasTokens: !!hasTokens
            };

        } catch (error) {
            return {
                hasClientId: false,
                hasClientSecret: false,
                hasTokens: false
            };
        }
    }

    async checkDependencies() {
        try {
            const packagePath = path.join(process.cwd(), 'package.json');
            const packageContent = await fs.readFile(packagePath, 'utf8');
            const packageJson = JSON.parse(packageContent);
            
            const requiredDeps = ['axios', 'express', 'dotenv', 'moment'];
            const installedDeps = Object.keys(packageJson.dependencies || {});
            
            const missingDeps = requiredDeps.filter(dep => !installedDeps.includes(dep));

            return {
                allInstalled: missingDeps.length === 0,
                missingDeps
            };

        } catch (error) {
            return {
                allInstalled: false,
                missingDeps: ['Unable to check dependencies']
            };
        }
    }

    printSetupStatus(checks) {
        console.log('\n' + '='.repeat(50));
        console.log('ZOHO API SETUP STATUS');
        console.log('='.repeat(50));

        console.log('\n📁 Environment File:');
        console.log(`  Exists: ${checks.envFile.exists ? '✅' : '❌'}`);
        console.log(`  Has Required Variables: ${checks.envFile.hasRequiredVars ? '✅' : '❌'}`);
        if (checks.envFile.missingVars.length > 0) {
            console.log(`  Missing: ${checks.envFile.missingVars.join(', ')}`);
        }

        console.log('\n🔑 Credentials:');
        console.log(`  Client ID: ${checks.credentials.hasClientId ? '✅' : '❌'}`);
        console.log(`  Client Secret: ${checks.credentials.hasClientSecret ? '✅' : '❌'}`);
        console.log(`  Access Tokens: ${checks.credentials.hasTokens ? '✅' : '❌'}`);

        console.log('\n📦 Dependencies:');
        console.log(`  All Installed: ${checks.dependencies.allInstalled ? '✅' : '❌'}`);
        if (checks.dependencies.missingDeps.length > 0) {
            console.log(`  Missing: ${checks.dependencies.missingDeps.join(', ')}`);
        }

        const isReady = checks.envFile.hasRequiredVars && 
                       checks.credentials.hasClientId && 
                       checks.credentials.hasClientSecret && 
                       checks.dependencies.allInstalled;

        console.log('\n🎯 Overall Status:');
        console.log(`  Ready for OAuth: ${isReady ? '✅' : '❌'}`);
        console.log(`  Has Access Token: ${checks.credentials.hasTokens ? '✅' : '❌'}`);

        if (!isReady || !checks.credentials.hasTokens) {
            console.log('\n📝 Next Steps:');
            
            if (!checks.dependencies.allInstalled) {
                console.log('  1. Install missing dependencies: npm install');
            }
            
            if (!checks.credentials.hasClientId || !checks.credentials.hasClientSecret) {
                console.log('  2. Set up Zoho Developer Console:');
                console.log('     - Go to https://api-console.zoho.in/');
                console.log('     - Create a new application');
                console.log('     - Choose "Server-based Applications"');
                console.log('     - Set redirect URI: http://localhost:3000/oauth/callback');
                console.log('     - Add scopes: ZohoPeople.attendance.ALL,ZohoPeople.forms.READ,ZohoPeople.employee.READ');
                console.log('     - Update .env file with Client ID and Secret');
            }
            
            if (!checks.credentials.hasTokens) {
                console.log('  3. Run OAuth authorization:');
                console.log('     - npm run oauth:start');
                console.log('     - Open http://localhost:3000 in browser');
                console.log('     - Complete authorization process');
            }
            
            console.log('  4. Test the setup: npm run test:zoho');
        }

        console.log('\n' + '='.repeat(50));
    }

    async createSampleEnv() {
        const sampleEnv = `# eSSL Configuration
ESSL_USERNAME=essl
ESSL_PASSWORD=essl

# Zoho OAuth Configuration
ZOHO_CLIENT_ID=your_zoho_client_id_here
ZOHO_CLIENT_SECRET=your_zoho_client_secret_here
ZOHO_REDIRECT_URI=http://localhost:3000/oauth/callback
ZOHO_SCOPE=ZohoPeople.attendance.ALL,ZohoPeople.forms.READ,ZohoPeople.employee.READ
ZOHO_ACCESS_TOKEN=
ZOHO_REFRESH_TOKEN=
ZOHO_TOKEN_EXPIRES_AT=

# Zoho API Configuration
ZOHO_API_BASE_URL=https://people.zoho.in/people/api
ZOHO_ACCOUNTS_URL=https://accounts.zoho.in
ZOHO_TIMEOUT=15000
ZOHO_MAX_RETRIES=3
ZOHO_RATE_LIMIT_DELAY=100

# OAuth Server Configuration
OAUTH_SERVER_PORT=3000
OAUTH_SERVER_HOST=localhost

# Environment
NODE_ENV=development
`;

        try {
            await fs.writeFile(this.envPath, sampleEnv, 'utf8');
            logger.success('Sample .env file created');
            return true;
        } catch (error) {
            logger.error('Failed to create .env file:', error.message);
            return false;
        }
    }
}

// CLI interface
if (require.main === module) {
    const setup = new ZohoSetup();
    
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
        case 'check':
            setup.checkSetup();
            break;
        
        case 'create-env':
            setup.createSampleEnv();
            break;
        
        default:
            console.log('Usage: node setup-zoho.js [check|create-env]');
            setup.checkSetup();
    }
}

module.exports = ZohoSetup;