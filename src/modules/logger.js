const fs = require('fs');
const path = require('path');
const log = require('electron-log');

// 延迟获取 Electron app 对象，避免在模块加载时访问未初始化的 app
let _appCache = null;

/**
 * 日志管理模块
 * 负责应用程序的日志记录、错误捕获和日志文件的自动清理
 */
class Logger {
    /**
     * 构造函数，初始化日志路径并开始初始化流程
     */
    constructor() {
        this.isInitialized = false;
        // 延迟获取日志路径，确保 app 对象已准备好
        try {
            this.baseLogsPath = this.getLogsPath();
        } catch (error) {
            console.error('获取日志路径失败:', error);
            this.baseLogsPath = path.join(__dirname, '..', 'logs');
        }
        this.initialize();
    }

    /**
     * 获取日志文件的存储路径
     * @returns {string} 日志存储目录的绝对路径
     */
    getLogsPath() {
        try {
            // 延迟获取 app 对象，确保在 Electron 环境完全准备好后再访问
            if (_appCache === null) {
                try {
                    const electron = require('electron');
                    _appCache = electron.app;
                } catch (error) {
                    _appCache = undefined;
                }
            }

            // 检查是否存在全局 app 对象
            if (typeof _appCache !== 'undefined' && _appCache && _appCache.getPath) {
                // 使用 userData 目录存储日志，确保在打包环境中可写
                const userDataPath = _appCache.getPath('userData');
                const logsPath = path.join(userDataPath, 'logs');
                return logsPath;
            }

            // 在开发环境或无法获取 app 时，使用项目根目录的 logs 文件夹
            const devPath = path.join(__dirname, '..', 'logs');
            return devPath;

        } catch (error) {
            // 如果获取应用路径失败，使用项目根目录的 logs 文件夹
            console.error('获取日志路径失败，使用备用路径:', error);
            const fallbackPath = path.join(__dirname, '..', 'logs');
            return fallbackPath;
        }
    }

    /**
     * 初始化日志系统
     * 设置日志配置、错误处理并标记初始化完成
     */
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

    /**
     * 配置 `electron-log`
     * 包括日志目录创建、文件名解析、输出格式设计等
     */
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

    /**
     * 设置全局错误处理
     * 捕获未处理的异常、Promise 拒绝以及渲染进程崩溃
     */
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
            if (_appCache && _appCache.on) {
                _appCache.on('web-contents-created', (event, contents) => {
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

    /**
     * 清理过期日志文件
     * 默认保留最近 7 天的日志
     */
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

    /**
     * 设置备用日志系统
     * 当常规日志系统初始化失败时，将日志输出到控制台并尝试追加到 fallback 文件
     */
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

    /**
     * 记录普通信息日志
     * @param {string} message - 日志内容
     */
    info(message) {
        if (this.isInitialized) {
            log.info(message);
        } else if (this.fallbackLog) {
            this.fallbackLog('info', message);
        } else {
            console.log(`[INFO] ${message}`);
        }
    }

    /**
     * 记录错误日志
     * @param {string} message - 日志内容
     */
    error(message) {
        if (this.isInitialized) {
            log.error(message);
        } else if (this.fallbackLog) {
            this.fallbackLog('error', message);
        } else {
            console.error(`[ERROR] ${message}`);
        }
    }

    /**
     * 记录警告日志
     * @param {string} message - 日志内容
     */
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
    /**
     * 获取当前日志系统的工作状态
     * @returns {Object} 包含初始化状态、路径和可写性的对象
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            logPath: this.baseLogsPath,
            canWrite: this.isInitialized || !!this.fallbackLog
        };
    }

    // 手动刷新日志（确保日志被写入文件）
    /**
     * 手动刷新日志流，确保所有挂起的日志已写入磁盘
     */
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