const os = require('os');
const logger = require('./logger');
const config = require('../config/config');

class HealthMonitor {
    constructor() {
        this.metrics = {
            startTime: Date.now(),
            totalSyncCycles: 0,
            successfulSyncs: 0,
            failedSyncs: 0,
            totalTransactions: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            lastError: null,
            averageSyncTime: 0,
            peakMemoryUsage: 0
        };
    }

    recordSyncStart() {
        this.metrics.totalSyncCycles++;
        this.currentSyncStart = Date.now();
    }

    recordSyncEnd(success, transactions = { synced: 0, failed: 0 }) {
        const syncDuration = Date.now() - this.currentSyncStart;
        
        // Update average sync time (moving average)
        this.metrics.averageSyncTime = 
            (this.metrics.averageSyncTime * (this.metrics.totalSyncCycles - 1) + syncDuration) / 
            this.metrics.totalSyncCycles;

        if (success) {
            this.metrics.successfulSyncs++;
        } else {
            this.metrics.failedSyncs++;
        }

        this.metrics.totalTransactions += transactions.synced + transactions.failed;
        this.metrics.successfulTransactions += transactions.synced;
        this.metrics.failedTransactions += transactions.failed;

        // Track peak memory usage
        const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
        this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, currentMemory);

        logger.performance(`Sync completed in ${syncDuration}ms - ${transactions.synced} successful, ${transactions.failed} failed`);
    }

    recordError(error) {
        this.metrics.lastError = {
            message: error.message,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };
    }

    getHealthStatus() {
        const memoryUsage = process.memoryUsage();
        const systemMemory = os.totalmem() / 1024 / 1024; // MB
        const usedMemory = memoryUsage.heapUsed / 1024 / 1024; // MB
        const memoryPercentage = (usedMemory / systemMemory) * 100;

        const uptime = Date.now() - this.metrics.startTime;
        const successRate = this.metrics.totalSyncCycles > 0 ? 
            (this.metrics.successfulSyncs / this.metrics.totalSyncCycles) * 100 : 0;

        return {
            status: this.isHealthy() ? 'healthy' : 'degraded',
            uptime: this.formatUptime(uptime),
            memory: {
                used: `${usedMemory.toFixed(2)}MB`,
                system: `${systemMemory.toFixed(2)}MB`,
                percentage: `${memoryPercentage.toFixed(1)}%`
            },
            performance: {
                totalSyncCycles: this.metrics.totalSyncCycles,
                successRate: `${successRate.toFixed(1)}%`,
                averageSyncTime: `${this.metrics.averageSyncTime.toFixed(0)}ms`,
                peakMemoryUsage: `${this.metrics.peakMemoryUsage.toFixed(2)}MB`
            },
            transactions: {
                total: this.metrics.totalTransactions,
                successful: this.metrics.successfulTransactions,
                failed: this.metrics.failedTransactions,
                successRate: this.metrics.totalTransactions > 0 ? 
                    `${((this.metrics.successfulTransactions / this.metrics.totalTransactions) * 100).toFixed(1)}%` : '0%'
            },
            lastError: this.metrics.lastError,
            timestamp: new Date().toISOString()
        };
    }

    isHealthy() {
        const memoryUsage = process.memoryUsage();
        const memoryPercentage = (memoryUsage.heapUsed / os.totalmem()) * 100;
        
        return (
            memoryPercentage < (config.performance.memoryThreshold * 100) &&
            this.metrics.failedSyncs < this.metrics.totalSyncCycles * 0.5 // Less than 50% failure rate
        );
    }

    formatUptime(milliseconds) {
        const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
        const hours = Math.floor((milliseconds % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
        
        return `${days}d ${hours}h ${minutes}m`;
    }

    reset() {
        this.metrics.startTime = Date.now();
        this.metrics.totalSyncCycles = 0;
        this.metrics.successfulSyncs = 0;
        this.metrics.failedSyncs = 0;
        this.metrics.totalTransactions = 0;
        this.metrics.successfulTransactions = 0;
        this.metrics.failedTransactions = 0;
        this.metrics.lastError = null;
        this.metrics.averageSyncTime = 0;
        this.metrics.peakMemoryUsage = 0;
    }
}

module.exports = HealthMonitor;