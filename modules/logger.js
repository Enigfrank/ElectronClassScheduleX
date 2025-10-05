const fs = require('fs');
const path = require('path');
const log = require('electron-log');

// 安全地获取 Electron app 对象
let app;
try {
    const electron = require('electron');
    app = electron.app;
} catch (error) {
    // 如果不是在 Electron 环境中运行，app 将为 undefined
    app = undefined;
}

class Logger {
    constructor() {
        this.baseLogsPath = this.getLogsPath();
        this.isInitialized = false;
        this.initialize();
    }

    getLogsPath() {
        try {
            // 尝试获取应用路径
            let appPath;
            
            // 检查是否存在全局 app 对象
            if (typeof app !== 'undefined' && app && app.getAppPath) {
                appPath = app.getAppPath();
                
                // 检查是否在打包环境中运行
                if (appPath.includes('app.asar')) {
                    // 在生产环境中，使用 app.asar.unpacked 目录
                    const prodPath = path.join(appPath, '..', 'app.asar.unpacked', 'logs');
                    return prodPath;
                }
            }
            
            // 在开发环境中，使用项目根目录的 logs 文件夹
            const devPath = path.join(__dirname, '..', 'logs');
            return devPath;
            
        } catch (error) {
            // 如果获取应用路径失败，使用项目根目录的 logs 文件夹
            const fallbackPath = path.join(__dirname, '..', 'logs');
            return fallbackPath;
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
            // 即使日志系统初始化失败，也不应该阻止应用运行
            this.setupFallbackLogging();
        }
    }

    async setupLogging() {
        try {
            // 确保日志目录存在
            if (!fs.existsSync(this.baseLogsPath)) {
                fs.mkdirSync(this.baseLogsPath, { recursive: true });
            }

            // 按日期生成日志文件
            log.transports.file.resolvePathFn = () => {
                const date = new Date().toISOString().split('T')[0];
                const fileName = `${date}.log`;
                return path.join(this.baseLogsPath, fileName);
            };

            // 日志配置
            log.transports.file.level = 'info';
            log.transports.console.level = 'info';
            log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';
            log.transports.console.format = '{h}:{i}:{s}.{ms} [{level}] {text}';

            // 确保日志文件可以被写入
            const testLogPath = log.transports.file.resolvePathFn();
            const testDir = path.dirname(testLogPath);
            if (!fs.existsSync(testDir)) {
                fs.mkdirSync(testDir, { recursive: true });
            }

            // 测试日志写入
            log.info('-------------------------日志分割处-------------------------');
            log.info('日志系统初始化成功');
            
            console.log(`日志文件路径: ${testLogPath}`);
        } catch (error) {
            console.error('日志配置失败:', error);
            throw error;
        }
    }

    setupErrorHandling() {
        try {
            // 错误捕获配置 - 使用新的 API
            if (log.errorHandler && log.errorHandler.start) {
                log.errorHandler.start({
                    showDialog: false,
                    onError: (error) => {
                        log.error('应用程序错误:', error);
                    }
                });
            } else if (log.catchErrors) {
                // 向后兼容
                log.catchErrors({
                    showDialog: false,
                    onError: (error) => {
                        log.error('应用程序错误:', error);
                    }
                });
            }

            // 捕获未处理的 Promise 拒绝
            process.on('unhandledRejection', (reason, promise) => {
                log.error('未处理的 Promise 拒绝:', reason);
                log.error('Promise:', promise);
            });

            // 捕获未捕获的异常
            process.on('uncaughtException', (error) => {
                log.error('未捕获的异常:', error);
            });

            // 捕获渲染进程错误（如果 app 可用）
            if (app && app.on) {
                app.on('web-contents-created', (event, contents) => {
                    if (contents && contents.on) {
                        contents.on('crashed', (event, killed) => {
                            log.error(`WebContents crashed (killed=${killed})`);
                        });
                    }
                });
            }
        } catch (error) {
            console.error('错误处理初始化失败:', error);
            // 不抛出错误，让日志系统可以继续工作
        }
    }

    cleanupOldLogs() {
        const logsPath = this.baseLogsPath;
        if (!fs.existsSync(logsPath)) return;

        try {
            const files = fs.readdirSync(logsPath);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天
            let deletedCount = 0;

            files.forEach(file => {
                if (file.endsWith('.log')) {
                    const filePath = path.join(logsPath, file);
                    try {
                        const stats = fs.statSync(filePath);
                        if (now - stats.mtime.getTime() > maxAge) {
                            fs.unlinkSync(filePath);
                            deletedCount++;
                            if (this.isInitialized) {
                                log.info(`删除旧日志文件: ${file}`);
                            }
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
            if (this.isInitialized) {
                log.error('清理旧日志失败:', error);
            }
        }
    }

    // 备用日志记录（当日志系统初始化失败时使用）
    setupFallbackLogging() {
        this.fallbackLog = (level, message) => {
            const timestamp = new Date().toISOString();
            const logMessage = `${timestamp} [${level.toUpperCase()}] ${message}`;
            console.log(logMessage);
            
            // 尝试写入到备用日志文件
            try {
                const fallbackLogPath = path.join(__dirname, '..', 'logs', 'fallback.log');
                const logsDir = path.dirname(fallbackLogPath);
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }
                fs.appendFileSync(fallbackLogPath, logMessage + '\n');
            } catch (writeError) {
                console.error('备用日志写入失败:', writeError);
            }
        };
    }

    info(message) {
        if (this.isInitialized) {
            log.info(message);
        } else if (this.fallbackLog) {
            this.fallbackLog('info', message);
        } else {
            console.log(`[INFO] ${message}`);
        }
    }

    error(message) {
        if (this.isInitialized) {
            log.error(message);
        } else if (this.fallbackLog) {
            this.fallbackLog('error', message);
        } else {
            console.error(`[ERROR] ${message}`);
        }
    }

    warn(message) {
        if (this.isInitialized) {
            log.warn(message);
        } else if (this.fallbackLog) {
            this.fallbackLog('warn', message);
        } else {
            console.warn(`[WARN] ${message}`);
        }
    }

    // 获取日志系统状态
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            logPath: this.baseLogsPath,
            canWrite: this.isInitialized || !!this.fallbackLog
        };
    }

    // 手动刷新日志（确保日志被写入文件）
    flush() {
        if (this.isInitialized && log && log.transports && log.transports.file) {
            try {
                log.transports.file.stream?.end();
                log.transports.file.stream = null;
            } catch (error) {
                console.error('刷新日志失败:', error);
            }
        }
    }
}

module.exports = Logger;