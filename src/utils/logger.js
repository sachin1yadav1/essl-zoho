const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class Logger {
    constructor() {
        this.ensureLogsDirectory();
    }

    ensureLogsDirectory() {
        const logsDir = path.dirname(config.logging.syncLogPath);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
    }

    log(message, level = 'INFO', logToFile = true) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${level}: ${message}`;
        
        // Console output with colors
        switch(level) {
            case 'ERROR':
                console.error(`❌ ${logMessage}`);
                break;
            case 'WARN':
                console.warn(`⚠️ ${logMessage}`);
                break;
            case 'SUCCESS':
                console.log(`✅ ${logMessage}`);
                break;
            case 'DEBUG':
                console.log(`🐛 ${logMessage}`);
                break;
            case 'PERF':
                console.log(`📊 ${logMessage}`);
                break;
            default:
                console.log(`📝 ${logMessage}`);
        }

        // File logging
        if (logToFile) {
            let logPath;
            switch(level) {
                case 'ERROR':
                    logPath = config.logging.errorLogPath;
                    break;
                case 'DEBUG':
                    logPath = config.logging.debugLogPath;
                    break;
                case 'PERF':
                    logPath = config.logging.performanceLogPath;
                    break;
                default:
                    logPath = config.logging.syncLogPath;
            }
            
            fs.appendFileSync(logPath, logMessage + '\n');
        }
    }

    info(message) {
        this.log(message, 'INFO');
    }

    error(message) {
        this.log(message, 'ERROR');
    }

    warn(message) {
        this.log(message, 'WARN');
    }

    success(message) {
        this.log(message, 'SUCCESS');
    }

    debug(message) {
        if (config.logging.level === 'debug') {
            this.log(message, 'DEBUG');
        }
    }

    performance(message) {
        this.log(message, 'PERF');
    }

    syncStats(synced, failed, total, duration) {
        const successRate = total > 0 ? ((synced / total) * 100).toFixed(1) : 0;
        this.info(`Sync Stats: ${synced}/${total} successful (${successRate}%) in ${duration}ms`);
    }

    healthStatus(status) {
        this.performance(`Health Check: ${JSON.stringify(status)}`);
    }
}

module.exports = new Logger();