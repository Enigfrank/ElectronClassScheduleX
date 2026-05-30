const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const { app } = require('electron'); 

/**
 * 日志管理模块
 * 负责应用程序的日志记录、错误捕获和日志文件的自动清理
 */
class Logger {
    constructor() {
        this.baseLogsPath = this.getLogsPath();
        this.isInitialized = false;
        this.fallbackLog = null;
    }

    /**
     * 获取日志文件的存储路径
     * @returns {string} 日志存储目录的绝对路径
     */
    getLogsPath() {
        try {
            return app.getPath('logs');
        } catch (error) {
            return path.join(__dirname, '..', 'logs');
        }
    }

    async initialize() {
        try {
            await this.setupLogging();
            this.setupErrorHandling();
            this.isInitialized = true;
            console.log('日志系统初始化完成');
        } catch (error) {
            console.error('日志系统初始化失败:', error);
            this.setupFallbackLogging();
        }
    }

    async setupLogging() {
        try {
            fs.mkdirSync(this.baseLogsPath, { recursive: true });

            // 按日期生成日志文件
            log.transports.file.resolvePathFn = () => {
                const date = new Date().toISOString().split('T')[0];
                return path.join(this.baseLogsPath, `${date}.log`);
            };

            // 日志配置
            log.transports.file.level = 'info';
            log.transports.console.level = 'info';
            log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';
            log.transports.console.format = '{h}:{i}:{s}.{ms} [{level}] {text}';
            log.transports.file.sync = true; // 同步写入，确保崩溃前日志不丢失

            // 测试日志写入
            log.info('-------------------------日志分割处-------------------------');
            log.info('日志系统初始化成功');

            console.log(`日志文件路径: ${log.transports.file.resolvePathFn()}`);
        } catch (error) {
            console.error('日志配置失败:', error);
            throw error;
        }
    }

    setupErrorHandling() {
        try {        
            // 渲染进程崩溃的监听
            if (app && app.on) {
                app.on('web-contents-created', (event, contents) => {
                    contents?.on('crashed', (event, killed) => {
                        log.error(`WebContents crashed (killed=${killed})`);
                    });
                });
            }
        } catch (error) {
            console.error('错误处理初始化失败:', error);
        }
    }

    cleanupOldLogs() {
        if (!fs.existsSync(this.baseLogsPath)) return;

        try {
            const files = fs.readdirSync(this.baseLogsPath);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
            let deletedCount = 0;

            files.forEach(file => {
                if (file.endsWith('.log')) {
                    const filePath = path.join(this.baseLogsPath, file);
                    try {
                        const stats = fs.statSync(filePath);
                        if (now - stats.mtime.getTime() > maxAge) {
                            fs.unlinkSync(filePath);
                            deletedCount++;
                            if (this.isInitialized) log.info(`删除旧日志文件: ${file}`);
                        }
                    } catch (fileError) {
                        console.error(`删除日志文件失败 ${file}:`, fileError);
                    }
                }
            });

            if (deletedCount > 0 && this.isInitialized) {
                log.info(`清理完成，共删除 ${deletedCount} 个旧日志文件`);
            }
        } catch (error) {
            console.error('清理旧日志失败:', error);
            if (this.isInitialized) log.error('清理旧日志失败:', error);
        }
    }

    setupFallbackLogging() {
        this.fallbackLog = (level, message) => {
            const timestamp = new Date().toISOString();
            const logMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;
            console.log(logMessage);

            try {
                const fallbackLogPath = path.join(__dirname, '..', 'logs', 'fallback.log');
                fs.mkdirSync(path.dirname(fallbackLogPath), { recursive: true });
                fs.appendFileSync(fallbackLogPath, logMessage + '\n');
            } catch (writeError) {
                console.error('备用日志写入失败:', writeError);
            }
        };
    }

    _log(level, ...args) {
        if (this.isInitialized) {
            log[level](...args);
        } else if (this.fallbackLog) {
            this.fallbackLog(level, args.join(' '));
        } else {
            console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${level.toUpperCase()}]`, ...args);
        }
    }

    info(...args) { this._log('info', ...args); }
    error(...args) { this._log('error', ...args); }
    warn(...args) { this._log('warn', ...args); }

    getStatus() {
        return {
            isInitialized: this.isInitialized,
            logPath: this.baseLogsPath,
            canWrite: this.isInitialized || !!this.fallbackLog
        };
    }

    /**
     * 手动刷新日志流
     * 注：由于 setupLogging 中已配置 sync = true，日志均为同步落盘，此方法保留仅为兼容外部调用
     */
    flush() {
        // 同步模式下无需额外操作
    }
}

module.exports = Logger;