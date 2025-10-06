const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const logger = require('../utils/logger');

class ZohoOAuthService {
    constructor() {
        this.clientId = config.zoho.oauth.clientId;
        this.clientSecret = config.zoho.oauth.clientSecret;
        this.redirectUri = config.zoho.oauth.redirectUri;
        this.scope = config.zoho.oauth.scope;
        this.accountsUrl = config.zoho.oauth.accountsUrl;
        // Enforce India DC
        if (!this.accountsUrl.includes('accounts.zoho.in')) {
            logger.warn('Switching Accounts URL to India DC: https://accounts.zoho.in');
            this.accountsUrl = 'https://accounts.zoho.in';
        }
        // Normalize scope casing
        if (this.scope) {
            this.scope = this.scope
                .split(',')
                .map(s => s.trim().replace(/^ZOHOPEOPLE\./, 'ZohoPeople.'))
                .join(',');
        }
        this.accessToken = config.zoho.oauth.accessToken;
        this.refreshToken = config.zoho.oauth.refreshToken;
        this.tokenExpiresAt = config.zoho.oauth.tokenExpiresAt;
        this.envPath = path.join(process.cwd(), '.env');
    }

    /**
     * Generate authorization URL for OAuth flow
     */
    getAuthorizationUrl() {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.clientId,
            scope: this.scope,
            redirect_uri: this.redirectUri,
            access_type: 'offline',
            prompt: 'consent'
        });

        const authUrl = `${this.accountsUrl}/oauth/v2/auth?${params.toString()}`;
        logger.info('Authorization URL generated');
        return authUrl;
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(authCode) {
        try {
            const tokenData = {
                grant_type: 'authorization_code',
                client_id: this.clientId,
                client_secret: this.clientSecret,
                redirect_uri: this.redirectUri,
                code: authCode
            };

            logger.info('Exchanging authorization code for access token...');
            
            const response = await axios.post(
                `${this.accountsUrl}/oauth/v2/token`,
                new URLSearchParams(tokenData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: config.zoho.timeout
                }
            );

            if (response.data.access_token) {
                const tokenInfo = {
                    accessToken: response.data.access_token,
                    refreshToken: response.data.refresh_token,
                    expiresIn: response.data.expires_in,
                    tokenType: response.data.token_type,
                    scope: response.data.scope
                };

                // Calculate expiration time
                const expiresAt = new Date(Date.now() + (tokenInfo.expiresIn * 1000));
                tokenInfo.expiresAt = expiresAt.toISOString();

                // Update instance variables
                this.accessToken = tokenInfo.accessToken;
                this.refreshToken = tokenInfo.refreshToken;
                this.tokenExpiresAt = tokenInfo.expiresAt;

                // Save tokens to .env file
                await this.saveTokensToEnv(tokenInfo);

                logger.success('Access token obtained and saved successfully');
                return tokenInfo;
            } else {
                throw new Error('No access token received from Zoho');
            }

        } catch (error) {
            logger.error('Failed to exchange code for token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshAccessToken() {
        if (!this.refreshToken) {
            throw new Error('No refresh token available. Please re-authorize.');
        }

        try {
            const refreshData = {
                grant_type: 'refresh_token',
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken,
                redirect_uri: this.redirectUri
            };

            logger.info('Refreshing access token...');

            const response = await axios.post(
                `${this.accountsUrl}/oauth/v2/token`,
                new URLSearchParams(refreshData),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: config.zoho.timeout
                }
            );

            if (response.data.access_token) {
                const tokenInfo = {
                    accessToken: response.data.access_token,
                    refreshToken: this.refreshToken, // Keep existing refresh token
                    expiresIn: response.data.expires_in,
                    tokenType: response.data.token_type
                };

                // Calculate expiration time
                const expiresAt = new Date(Date.now() + (tokenInfo.expiresIn * 1000));
                tokenInfo.expiresAt = expiresAt.toISOString();

                // Update instance variables
                this.accessToken = tokenInfo.accessToken;
                this.tokenExpiresAt = tokenInfo.expiresAt;

                // Save updated tokens to .env file
                await this.saveTokensToEnv(tokenInfo);

                logger.success('Access token refreshed successfully');
                return tokenInfo;
            } else {
                throw new Error('No access token received during refresh');
            }

        } catch (error) {
            logger.error('Failed to refresh access token:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Check if access token is valid and not expired
     */
    isTokenValid() {
        if (!this.accessToken) {
            return false;
        }

        if (!this.tokenExpiresAt) {
            return true; // Assume valid if no expiration time
        }

        const expirationTime = new Date(this.tokenExpiresAt);
        const currentTime = new Date();
        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

        return currentTime < (expirationTime.getTime() - bufferTime);
    }

    /**
     * Get valid access token (refresh if needed)
     */
    async getValidAccessToken() {
        if (this.isTokenValid()) {
            return this.accessToken;
        }

        if (this.refreshToken) {
            try {
                const tokenInfo = await this.refreshAccessToken();
                return tokenInfo.accessToken;
            } catch (error) {
                logger.error('Failed to refresh token:', error.message);
                throw new Error('Token refresh failed. Please re-authorize.');
            }
        }

        throw new Error('No valid access token available. Please authorize first.');
    }

    /**
     * Save tokens to .env file
     */
    async saveTokensToEnv(tokenInfo) {
        try {
            // Read current .env file
            let envContent = '';
            try {
                envContent = await fs.readFile(this.envPath, 'utf8');
            } catch (error) {
                // File doesn't exist, create new content
                envContent = '';
            }

            // Update or add token variables
            const updates = {
                'ZOHO_ACCESS_TOKEN': tokenInfo.accessToken,
                'ZOHO_REFRESH_TOKEN': tokenInfo.refreshToken || this.refreshToken,
                'ZOHO_TOKEN_EXPIRES_AT': tokenInfo.expiresAt
            };

            let updatedContent = envContent;

            for (const [key, value] of Object.entries(updates)) {
                if (value) {
                    const regex = new RegExp(`^${key}=.*$`, 'm');
                    const newLine = `${key}=${value}`;
                    
                    if (regex.test(updatedContent)) {
                        updatedContent = updatedContent.replace(regex, newLine);
                    } else {
                        updatedContent += updatedContent.endsWith('\n') ? '' : '\n';
                        updatedContent += `${newLine}\n`;
                    }
                }
            }

            await fs.writeFile(this.envPath, updatedContent, 'utf8');
            logger.info('Tokens saved to .env file');

        } catch (error) {
            logger.error('Failed to save tokens to .env file:', error.message);
            throw error;
        }
    }

    /**
     * Revoke access token
     */
    async revokeToken() {
        if (!this.accessToken) {
            logger.warn('No access token to revoke');
            return;
        }

        try {
            // Use refresh token for revocation if available, otherwise use access token
            const tokenToRevoke = this.refreshToken || this.accessToken;
            
            await axios.post(
                `${this.accountsUrl}/oauth/v2/token/revoke`,
                new URLSearchParams({ token: tokenToRevoke }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    timeout: config.zoho.timeout
                }
            );

            logger.success('Token revoked successfully');

        } catch (error) {
            // Handle 400 error - token is already invalid/revoked
            if (error.response?.status === 400) {
                logger.warn('Token was already invalid or revoked');
            } else {
                logger.error('Failed to revoke token:', error.response?.data || error.message);
                throw error;
            }
        } finally {
            // Always clear tokens from instance and .env, regardless of revocation success
            this.accessToken = null;
            this.refreshToken = null;
            this.tokenExpiresAt = null;

            await this.saveTokensToEnv({
                accessToken: '',
                refreshToken: '',
                expiresAt: ''
            });
        }
    }

    /**
     * Get token information
     */
    getTokenInfo() {
        return {
            hasAccessToken: !!this.accessToken,
            hasRefreshToken: !!this.refreshToken,
            isValid: this.isTokenValid(),
            expiresAt: this.tokenExpiresAt,
            scope: this.scope
        };
    }
}

module.exports = ZohoOAuthService;