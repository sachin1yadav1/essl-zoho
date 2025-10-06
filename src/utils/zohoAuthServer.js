require('dotenv').config();
const express = require('express');
const config = require('../config/config');
const logger = require('./logger');
const ZohoOAuthService = require('../services/ZohoOAuthService');

class ZohoAuthServer {
    constructor() {
        this.app = express();
        this.oauthService = new ZohoOAuthService();
        this.port = config.zoho.oauthServer.port;
        this.host = config.zoho.oauthServer.host;
        this.setupRoutes();
    }

    setupRoutes() {
        // Middleware
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Serve static HTML for authorization
        this.app.get('/', (req, res) => {
            const authUrl = this.oauthService.getAuthorizationUrl();
            const tokenInfo = this.oauthService.getTokenInfo();
            
            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Zoho OAuth Authorization</title>
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
                        .container { background: #f5f5f5; padding: 30px; border-radius: 10px; }
                        .status { padding: 15px; margin: 20px 0; border-radius: 5px; }
                        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
                        .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
                        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
                        .btn { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
                        .btn:hover { background: #0056b3; }
                        .btn-danger { background: #dc3545; }
                        .btn-danger:hover { background: #c82333; }
                        .code-block { background: #f8f9fa; padding: 15px; border-radius: 5px; font-family: monospace; margin: 10px 0; }
                        pre { white-space: pre-wrap; word-wrap: break-word; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Zoho OAuth Authorization</h1>
                        
                        <div class="status ${tokenInfo.hasAccessToken ? (tokenInfo.isValid ? 'success' : 'warning') : 'error'}">
                            <h3>Current Status:</h3>
                            <ul>
                                <li>Access Token: ${tokenInfo.hasAccessToken ? '✓ Available' : '✗ Not Available'}</li>
                                <li>Refresh Token: ${tokenInfo.hasRefreshToken ? '✓ Available' : '✗ Not Available'}</li>
                                <li>Token Valid: ${tokenInfo.isValid ? '✓ Yes' : '✗ No'}</li>
                                <li>Expires At: ${tokenInfo.expiresAt || 'Unknown'}</li>
                                <li>Scope: ${tokenInfo.scope}</li>
                            </ul>
                        </div>

                        ${!tokenInfo.hasAccessToken || !tokenInfo.isValid ? `
                            <h3>Authorization Required</h3>
                            <p>Click the button below to authorize this application with Zoho People:</p>
                            <a href="${authUrl}" class="btn" target="_blank">Authorize with Zoho</a>
                            <p><small>After authorization, you'll be redirected back to this server.</small></p>
                        ` : `
                            <h3>Authorization Complete</h3>
                            <p>Your application is successfully authorized with Zoho People!</p>
                        `}

                        ${tokenInfo.hasAccessToken ? `
                            <h3>Actions</h3>
                            <a href="/test" class="btn">Test API Connection</a>
                            <a href="/revoke" class="btn btn-danger" onclick="return confirm('Are you sure you want to revoke the access token?')">Revoke Token</a>
                        ` : ''}

                        <h3>Setup Instructions</h3>
                        <ol>
                            <li>Create a Zoho Developer Console application at <a href="https://api-console.zoho.in/" target="_blank">https://api-console.zoho.in/</a></li>
                            <li>Choose "Server-based Applications" for production or "Self Client" for development</li>
                            <li>Set the redirect URI to: <code>http://localhost:3000/oauth/callback</code></li>
                            <li>Add the required scopes: <code>ZohoPeople.attendance.ALL,ZohoPeople.forms.READ,ZohoPeople.employee.READ</code></li>
                            <li>Update your .env file with the Client ID and Client Secret</li>
                            <li>Restart this server and click "Authorize with Zoho"</li>
                        </ol>

                        <h3>Environment Variables</h3>
                        <div class="code-block">
                            <pre>ZOHO_CLIENT_ID=your_client_id_here
ZOHO_CLIENT_SECRET=your_client_secret_here
ZOHO_REDIRECT_URI=http://localhost:3000/oauth/callback
ZOHO_SCOPE=ZohoPeople.attendance.ALL,ZohoPeople.employee.READ</pre>
                        </div>
                    </div>
                </body>
                </html>
            `);
        });

        // OAuth callback route
        this.app.get('/oauth/callback', async (req, res) => {
            const { code, error } = req.query;

            if (error) {
                logger.error('OAuth authorization error:', error);
                res.send(`
                    <h1>Authorization Failed</h1>
                    <p>Error: ${error}</p>
                    <a href="/">Go Back</a>
                `);
                return;
            }

            if (!code) {
                res.send(`
                    <h1>Authorization Failed</h1>
                    <p>No authorization code received</p>
                    <a href="/">Go Back</a>
                `);
                return;
            }

            try {
                const tokenInfo = await this.oauthService.exchangeCodeForToken(code);
                
                res.send(`
                    <h1>Authorization Successful!</h1>
                    <p>Access token has been obtained and saved.</p>
                    <ul>
                        <li>Token Type: ${tokenInfo.tokenType}</li>
                        <li>Expires In: ${tokenInfo.expiresIn} seconds</li>
                        <li>Scope: ${tokenInfo.scope}</li>
                    </ul>
                    <a href="/">Go Back</a>
                    <a href="/test">Test API Connection</a>
                `);

            } catch (error) {
                logger.error('Failed to exchange code for token:', error.message);
                res.send(`
                    <h1>Token Exchange Failed</h1>
                    <p>Error: ${error.message}</p>
                    <a href="/">Go Back</a>
                `);
            }
        });

        // Test API connection
        this.app.get('/test', async (req, res) => {
            try {
                const ZohoService = require('../services/ZohoService');
                const zohoService = new ZohoService();
                const result = await zohoService.testConnection();

                res.json({
                    success: result.success,
                    message: result.message || result.error,
                    details: result
                });

            } catch (error) {
                res.json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Revoke token
        this.app.get('/revoke', async (req, res) => {
            try {
                await this.oauthService.revokeToken();
                res.send(`
                    <h1>Token Revoked</h1>
                    <p>Access token has been successfully revoked.</p>
                    <a href="/">Go Back</a>
                `);

            } catch (error) {
                res.send(`
                    <h1>Revocation Failed</h1>
                    <p>Error: ${error.message}</p>
                    <a href="/">Go Back</a>
                `);
            }
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                tokenInfo: this.oauthService.getTokenInfo()
            });
        });
    }

    start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, this.host, () => {
                    logger.success(`Zoho OAuth server running at http://${this.host}:${this.port}`);
                    logger.info('Open the URL in your browser to authorize the application');
                    resolve();
                });

                this.server.on('error', (error) => {
                    logger.error('OAuth server error:', error.message);
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logger.info('OAuth server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// If this file is run directly, start the server
if (require.main === module) {
    const authServer = new ZohoAuthServer();
    
    authServer.start().catch((error) => {
        logger.error('Failed to start OAuth server:', error.message);
        process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        logger.info('Shutting down OAuth server...');
        await authServer.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        logger.info('Shutting down OAuth server...');
        await authServer.stop();
        process.exit(0);
    });
}

module.exports = ZohoAuthServer;