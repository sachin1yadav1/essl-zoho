const ESSLService = require('./services/ESSLService');
const ZohoService = require('./services/ZohoService');
const OptimizedSyncService = require('./services/OptimizedSyncService');
const HealthMonitor = require('./utils/healthMonitor');
const config = require('./config/config');
const logger = require('./utils/logger');

class Application {
    constructor() {
        this.esslService = new ESSLService();
        this.zohoService = new ZohoService();
        this.healthMonitor = new HealthMonitor();
        this.syncService = new OptimizedSyncService(
            this.esslService, 
            this.zohoService, 
            this.healthMonitor
        );
        
        this.isRunning = false;
        this.healthCheckInterval = null;
    }

    async start() {
        try {
            logger.success('🚀 eSSL to Zoho People Sync Service - Production Ready');
            logger.info(`Environment: ${config.environment}`);
            logger.info(`Base sync interval: ${config.essl.baseInterval}ms`);
            logger.info(`Adaptive polling: Enabled`);
            
            // Test connections on startup
            await this.testConnections();
            
            // Start health monitoring
            this.startHealthMonitoring();
            
            // Start the sync service
            await this.syncService.start();
            
            this.isRunning = true;
            
            // Handle graceful shutdown
            this.setupGracefulShutdown();
            
            logger.success('✅ All services started successfully');
            
        } catch (error) {
            logger.error(`❌ Failed to start application: ${error.message}`);
            process.exit(1);
        }
    }

    async testConnections() {
        logger.info('🔧 Testing system connections...');
        
        // Test eSSL connection
        logger.info('Testing eSSL connection...');
        const esslTest = await this.esslService.testConnection();
        
        if (esslTest.success) {
            logger.success(`eSSL: ${esslTest.message}`);
            if (esslTest.transactions && esslTest.transactions.length > 0) {
                logger.debug(`Sample transaction: ${JSON.stringify(esslTest.transactions[0])}`);
            }
        } else {
            logger.error(`eSSL: ${esslTest.message}`);
            throw new Error('eSSL connection test failed');
        }

        // Test Zoho connection
        logger.info('Testing Zoho connection...');
        const zohoTest = await this.zohoService.testConnection();
        
        if (zohoTest.success) {
            logger.success(`Zoho: ${zohoTest.message}`);
        } else {
            logger.error(`Zoho: ${zohoTest.message}`);
            throw new Error('Zoho connection test failed');
        }

        logger.success('✅ All connection tests passed');
    }

    startHealthMonitoring() {
        this.healthCheckInterval = setInterval(() => {
            const healthStatus = this.healthMonitor.getHealthStatus();
            
            if (healthStatus.status === 'degraded') {
                logger.warn(`⚠️ System health degraded: ${JSON.stringify(healthStatus)}`);
            }
            
            logger.healthStatus(healthStatus);
            
        }, config.performance.healthCheckInterval);

        logger.info(`📊 Health monitoring started (${config.performance.healthCheckInterval}ms interval)`);
    }

    setupGracefulShutdown() {
        const shutdown = async (signal) => {
            logger.info(`\n⚡ Received ${signal}, initiating graceful shutdown...`);
            this.isRunning = false;
            
            // Clear intervals
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
            }
            
            // Stop sync service
            this.syncService.stop();
            
            // Perform one final health check
            const finalHealth = this.healthMonitor.getHealthStatus();
            logger.healthStatus(finalHealth);
            
            // Small delay to ensure final sync completes
            await this.delay(2000);
            
            logger.success('🎯 Sync service shutdown complete');
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
        
        process.on('uncaughtException', (error) => {
            logger.error(`💥 Uncaught Exception: ${error.message}`);
            logger.error(error.stack);
            shutdown('UNCAUGHT_EXCEPTION');
        });

        process.on('unhandledRejection', (reason, promise) => {
            logger.error(`💥 Unhandled Rejection at: ${promise}, reason: ${reason}`);
            shutdown('UNHANDLED_REJECTION');
        });
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            health: this.healthMonitor.getHealthStatus(),
            sync: this.syncService.getStatus(),
            timestamp: new Date().toISOString()
        };
    }
}

// Start the application
if (require.main === module) {
    const app = new Application();
    app.start();
}

module.exports = Application;