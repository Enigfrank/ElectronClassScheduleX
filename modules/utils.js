const path = require('path');
const fs = require('fs');
const { dialog } = require('electron');

class Utils {
    constructor() {
        this.basePath = path.join(__dirname, '..');
    }

    // 获取资源路径
    getAssetPath(...paths) {
        const fullPath = path.join(this.basePath, ...paths);
        
        // 增加路径检查
        if (!fs.existsSync(fullPath)) {
            console.error(`资源不存在: ${fullPath}`);
        }
        return fullPath;
    }

    // 显示消息对话框
    showMessage(win, title, message, type = 'info') {
        return dialog.showMessageBox(win, {
            title,
            message,
            type,
            buttons: ['知道了']
        });
    }

    // 验证时间格式 (HH:MM)
    validateTimeFormat(timeStr) {
        const timeRegex = /^(\d{2}):(\d{2})$/;
        return timeRegex.test(timeStr);
    }

    // 计算时间差（毫秒）
    calculateTimeDifference(targetTime) {
        const now = new Date();
        return targetTime - now;
    }

    // 格式化时间显示
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
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // 检查文件是否存在
    fileExists(filePath) {
        return fs.existsSync(filePath);
    }

    // 创建目录（如果不存在）
    ensureDirectoryExists(dirPath) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
}

module.exports = Utils;