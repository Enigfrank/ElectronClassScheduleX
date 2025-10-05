const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const { app } = require('electron');

class Logger {
    constructor() {
        this.baseLogsPath = path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'logs');
        this.setupLogging();
        this.setupErrorHandling();
    }

    setupLogging() {
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

        log.info('-------------------------日志分割处-------------------------');
    }

    setupErrorHandling() {
        // 错误捕获配置
        log.catchErrors({
            showDialog: false,
            onError: (error) => {
                log.error('应用程序错误:', error);
            }
        });

        // 捕获未处理的 Promise 拒绝
        process.on('unhandledRejection', (reason, promise) => {
            log.error('未处理的 Promise 拒绝:', reason);
            log.error('Promise:', promise);
        });

        // 捕获未捕获的异常
        process.on('uncaughtException', (error) => {
            log.error('未捕获的异常:', error);
        });

        // 捕获渲染进程错误
        app.on('web-contents-created', (event, contents) => {
            contents.on('crashed', (event, killed) => {
                log.error(`WebContents crashed (killed=${killed})`);
            });
        });
    }

    cleanupOldLogs() {
        const logsPath = path.join(app.getAppPath(), 'logs');
        if (!fs.existsSync(logsPath)) return;

        const files = fs.readdirSync(logsPath);
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天

        files.forEach(file => {
            if (file.endsWith('.log')) {
                const filePath = path.join(logsPath, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    log.info(`删除旧日志文件: ${file}`);
                }
            }
        });
    }

    info(message) {
        log.info(message);
    }

    error(message) {
        log.error(message);
    }

    warn(message) {
        log.warn(message);
    }
}

module.exports = Logger;