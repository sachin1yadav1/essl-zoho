const moment = require('moment');
const config = require('../config/config');
const employeeMapping = require('../config/employee-mapping');
const logger = require('../utils/logger');

class OptimizedSyncService {
    constructor(esslService, zohoService, healthMonitor) {
        this.esslService = esslService;
        this.zohoService = zohoService;
        this.healthMonitor = healthMonitor;
        
        this.lastSyncTime = config.sync.lastSyncTime;
        this.currentInterval = config.essl.baseInterval;
        this.emptyPollsCount = 0;
        this.consecutiveErrors = 0;
        this.isRunning = false;
        
        this.syncStats = {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            lastSync: null,
            averageProcessingTime: 0
        };

        this.peakHours = {
            morning: { start: 8, end: 10 },   // 8AM - 10AM
            evening: { start: 17, end: 19 }   // 5PM - 7PM
        };
    }

    async start() {
        this.isRunning = true;
        logger.success(`🚀 Starting optimized sync service`);
        logger.info(`Initial interval: ${this.currentInterval}ms, Adaptive: Enabled`);
        
        await this.syncCycle();
    }

    async syncCycle() {
        if (!this.isRunning) return;

        try {
            this.healthMonitor.recordSyncStart();
            const cycleStart = Date.now();

            const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
            logger.debug(`Sync cycle started from ${this.lastSyncTime} to ${currentTime}`);

            const transactions = await this.esslService.getTransactions(
                this.lastSyncTime, 
                currentTime
            );

            let syncResults = { synced: 0, failed: 0 };

            if (transactions.length === 0) {
                logger.debug('No new transactions found');
                this.handleEmptyPoll();
            } else {
                logger.info(`Processing ${transactions.length} new transactions`);
                syncResults = await this.processTransactions(transactions);
                this.handleSuccessfulPoll();
            }

            // Update last sync time
            this.lastSyncTime = currentTime;
            this.syncStats.lastSync = new Date();

            const cycleDuration = Date.now() - cycleStart;
            this.healthMonitor.recordSyncEnd(true, syncResults);
            
            logger.syncStats(syncResults.synced, syncResults.failed, transactions.length, cycleDuration);

        } catch (error) {
            this.healthMonitor.recordSyncEnd(false);
            this.healthMonitor.recordError(error);
            this.handleSyncError(error);
        }

        // Schedule next cycle with adaptive interval
        if (this.isRunning) {
            this.adjustIntervalBasedOnTime();
            logger.debug(`Next sync in ${this.currentInterval}ms`);
            setTimeout(() => this.syncCycle(), this.currentInterval);
        }
    }

    async processTransactions(transactions) {
        const results = { synced: 0, failed: 0 };
        
        // Process in batches to avoid overwhelming Zoho API
        const batchSize = this.calculateBatchSize(transactions.length);
        
        for (let i = 0; i < transactions.length; i += batchSize) {
            const batch = transactions.slice(i, i + batchSize);
            const batchResults = await this.processBatch(batch);
            
            results.synced += batchResults.synced;
            results.failed += batchResults.failed;
            
            // Small delay between batches to respect rate limits
            if (i + batchSize < transactions.length) {
                await this.delay(config.zoho.rateLimitDelay);
            }
        }
        
        return results;
    }

    async processBatch(batch) {
        const results = { synced: 0, failed: 0 };
        const promises = [];

        for (const transaction of batch) {
            promises.push(this.processSingleTransaction(transaction));
        }

        const batchResults = await Promise.allSettled(promises);
        
        batchResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
                results.synced++;
            } else {
                results.failed++;
            }
        });

        return results;
    }

    async processSingleTransaction(transaction) {
        try {
            const punchData = this.transformTransaction(transaction);
            
            if (!punchData) {
                logger.warn(`Skipping invalid transaction: ${JSON.stringify(transaction)}`);
                return false;
            }

            const result = await this.zohoService.sendAttendance(punchData);
            
            if (result.success) {
                this.syncStats.successful++;
                return true;
            } else {
                this.syncStats.failed++;
                logger.error(`Failed to sync transaction for ${punchData.zohoEmpId}: ${result.error}`);
                return false;
            }
            
        } catch (error) {
            this.syncStats.failed++;
            logger.error(`Error processing transaction: ${error.message}`);
            return false;
        }
    }

    transformTransaction(transaction) {
        try {
            const esslEmpCode = transaction.EmployeeCode || transaction.employeeCode;
            const zohoEmpId = employeeMapping[esslEmpCode];

            if (!zohoEmpId) {
                logger.warn(`No Zoho mapping found for eSSL employee: ${esslEmpCode}`);
                return null;
            }

            const punchTime = this.formatTimestamp(
                transaction.PunchDate || transaction.punchDate,
                transaction.PunchTime || transaction.punchTime
            );

            if (!punchTime) {
                logger.warn(`Invalid timestamp for employee ${esslEmpCode}`);
                return null;
            }

            return {
                zohoEmpId: zohoEmpId,
                punchTime: punchTime,
                comments: `Biometric: ${transaction.DeviceName || transaction.MachineName || 'eSSL Device'}`,
                deviceId: transaction.DeviceID || transaction.MachineNo,
                rawData: transaction
            };
            
        } catch (error) {
            logger.error(`Error transforming transaction: ${error.message}`);
            return null;
        }
    }

    formatTimestamp(dateStr, timeStr) {
        try {
            let timestamp;
            
            if (dateStr && timeStr) {
                timestamp = `${dateStr} ${timeStr}`;
            } else if (dateStr && dateStr.includes(' ')) {
                timestamp = dateStr;
            } else {
                return null;
            }

            const parsed = moment(timestamp, [
                'YYYY-MM-DD HH:mm:ss', 
                'DD/MM/YYYY HH:mm:ss',
                'MM/DD/YYYY HH:mm:ss',
                'YYYY/MM/DD HH:mm:ss'
            ]);
            
            if (!parsed.isValid()) {
                return null;
            }

            return parsed.format('YYYY-MM-DD HH:mm:ss');
            
        } catch (error) {
            logger.error(`Error formatting timestamp: ${error.message}`);
            return null;
        }
    }

    calculateBatchSize(transactionCount) {
        if (transactionCount <= 10) return 1; // Process individually for small batches
        if (transactionCount <= 50) return 5; // Small batches for medium loads
        return config.sync.batchSize; // Use configured batch size for large loads
    }

    handleEmptyPoll() {
        this.emptyPollsCount++;
        this.consecutiveErrors = 0;

        // Gradually increase interval during low activity
        if (this.emptyPollsCount >= config.sync.emptyPollsToBackoff) {
            const newInterval = Math.min(
                config.essl.maxInterval,
                this.currentInterval * config.sync.backoffFactor
            );
            
            if (newInterval !== this.currentInterval) {
                logger.info(`📈 Low activity - increasing interval to ${newInterval}ms`);
                this.currentInterval = newInterval;
            }
        }
    }

    handleSuccessfulPoll() {
        this.emptyPollsCount = 0;
        this.consecutiveErrors = 0;
        
        // Reset to base interval when activity is detected
        if (this.currentInterval !== config.essl.baseInterval) {
            logger.info(`📉 Activity detected - resetting interval to ${config.essl.baseInterval}ms`);
            this.currentInterval = config.essl.baseInterval;
        }
    }

    handleSyncError(error) {
        this.consecutiveErrors++;
        this.emptyPollsCount = 0;

        // Exponential backoff on errors
        const newInterval = Math.min(
            config.essl.maxInterval,
            config.essl.baseInterval * Math.pow(config.sync.backoffFactor, this.consecutiveErrors)
        );

        if (newInterval !== this.currentInterval) {
            logger.warn(`🚨 Errors detected - increasing interval to ${newInterval}ms`);
            this.currentInterval = newInterval;
        }

        logger.error(`Sync error: ${error.message}`);
    }

    adjustIntervalBasedOnTime() {
        const currentHour = new Date().getHours();
        const isPeakHour = 
            (currentHour >= this.peakHours.morning.start && currentHour < this.peakHours.morning.end) ||
            (currentHour >= this.peakHours.evening.start && currentHour < this.peakHours.evening.end);

        if (isPeakHour && this.currentInterval > config.essl.minInterval) {
            // Use shorter intervals during peak hours
            this.currentInterval = Math.max(config.essl.minInterval, this.currentInterval / 2);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    stop() {
        this.isRunning = false;
        logger.info('🛑 Sync service stopped');
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            currentInterval: this.currentInterval,
            lastSyncTime: this.lastSyncTime,
            syncStats: { ...this.syncStats },
            performance: {
                emptyPollsCount: this.emptyPollsCount,
                consecutiveErrors: this.consecutiveErrors
            },
            services: {
                essl: this.esslService.getStats(),
                zoho: this.zohoService.getStats()
            }
        };
    }

    resetStats() {
        this.syncStats = {
            totalProcessed: 0,
            successful: 0,
            failed: 0,
            lastSync: this.syncStats.lastSync,
            averageProcessingTime: 0
        };
    }
}

module.exports = OptimizedSyncService;