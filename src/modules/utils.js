const path = require('path');
const fs = require('fs');
const { dialog } = require('electron');

/**
 * 通用工具类
 * 提供路径获取、对话框显示、时间处理等常用辅助函数
 */
class Utils {
    /**
     * @param {Object} logger - 日志记录器实例
     */
    constructor(logger = null) {
        this.basePath = path.join(__dirname, '..');
        this.logger = logger;
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志内容
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    /**
     * 获取资源文件的物理路径
     * @param {...string} paths - 路径片段
     * @returns {string} 资源的绝对路径
     */
    getAssetPath(...paths) {
        const fullPath = path.join(this.basePath, ...paths);

        if (!fs.existsSync(fullPath)) {
            this.log('error', `[工具类] 资源不存在: ${fullPath}`);
        }
        return fullPath;
    }

    // 显示消息对话框
    /**
     * 显示一个简单的消息对话框
     * @param {BrowserWindow} win - 父窗口
     * @param {string} title - 对话框标题
     * @param {string} message - 消息内容
     * @param {string} type - 对话框类型 (info, error, etc.)
     * @returns {Promise}
     */
    showMessage(win, title, message, type = 'info') {
        return dialog.showMessageBox(win, {
            title,
            message,
            type,
            buttons: ['知道了']
        });
    }

    // 验证时间格式 (HH:MM)
    /**
     * 验证时间格式是否为 HH:MM
     * @param {string} timeStr - 时间字符串
     * @returns {boolean}
     */
    validateTimeFormat(timeStr) {
        const timeRegex = /^(\d{2}):(\d{2})$/;
        return timeRegex.test(timeStr);
    }

    // 计算时间差（毫秒）
    /**
     * 计算当前时间与目标日期对象的时间差
     * @param {Date} targetTime - 目标时间对象
     * @returns {number} 毫秒数差值
     */
    calculateTimeDifference(targetTime) {
        const now = new Date();
        return targetTime - now;
    }

    // 格式化时间显示
    /**
     * 将毫秒数差值格式化为易读的字符串（如：X小时Y分钟）
     * @param {number} milliseconds - 毫秒数
     * @returns {string} 格式化后的字符串
     */
    formatTimeDifference(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}小时${minutes % 60}分钟`;
        } else if (minutes > 0) {
            return `${minutes}分钟${seconds % 60}秒`;
        } else {
            return `${seconds}秒`;
        }
    }

    // 延迟函数
    /**
     * 异步延迟函数
     * @param {number} ms - 延迟的毫秒数
     * @returns {Promise}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 检查文件是否存在
    /**
     * 检查给定的物理路径是否存在
     * @param {string} filePath - 文件或目录路径
     * @returns {boolean}
     */
    fileExists(filePath) {
        return fs.existsSync(filePath);
    }

    // 创建目录（如果不存在）
    /**
     * 确保目录存在，若不存在则递归创建
     * @param {string} dirPath - 目录路径
     */
    ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
}

module.exports = Utils;