const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const APP_NAME = 'electron-class-schedule-x';
const CONFIG_DIR_NAME = 'config';
const CONFIG_FILE_NAME = 'scheduleConfig.js';
const SOURCE_CONFIG_PATH = path.join(__dirname, '..', 'js', CONFIG_FILE_NAME);

/**
 * 课表配置提取模块
 * 负责将默认的课表配置文件提取到用户的 AppData 目录中，以便用户进行自定义。
 */
class ScheduleConfigExtractor {
    /**
     * @param {Object} logger - 日志记录器实例
     */
    constructor(logger = null) {
        this.logger = logger;
        this.configDir = path.join(app.getPath('appData'), APP_NAME, CONFIG_DIR_NAME);
        this.configFilePath = path.join(this.configDir, CONFIG_FILE_NAME);
    }

    /**
     * 记录日志
     */
    log(level, message) {
        if (this.logger?.[level]) {
            this.logger[level](message);
        } else {
            console.log(`[${level.toUpperCase()}] ${message}`);
        }
    }

    /**
     * 获取配置目录路径
     * @returns {string} 配置目录的绝对路径
     */
    getConfigDir() {
        return this.configDir;
    }

    /**
     * 获取配置文件路径
     * @returns {string} 配置文件的绝对路径
     */
    getConfigFilePath() {
        return this.configFilePath;
    }

    /**
     * 确保目录存在，如果不存在则创建
     * @param {string} dirPath - 目录路径
     * @returns {boolean} 是否存在或创建成功
     */
    ensureDirectoryExists(dirPath) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            return true;
        } catch (error) {
            this.log('error', `[配置提取] 创建配置目录失败: ${error.message}`);
            return false;
        }
    }

    /**
     * 检查配置文件是否已存在
     * @returns {boolean}
     */
    configExists() {
        return fs.existsSync(this.configFilePath);
    }

    /**
     * 提取默认配置文件到应用数据目录
     * @returns {Object} 包含 success, error 或 path 的结果对象
     */
    extractConfig() {
        try {
            if (!this.ensureDirectoryExists(this.configDir)) {
                return { success: false, error: '无法创建配置目录' };
            }

            if (!fs.existsSync(SOURCE_CONFIG_PATH)) {
                this.log('error', `[配置提取] 源配置文件不存在: ${SOURCE_CONFIG_PATH}`);
                return { success: false, error: '源配置文件不存在' };
            }

            fs.copyFileSync(SOURCE_CONFIG_PATH, this.configFilePath);

            this.log('info', `[配置提取] 配置文件已提取到: ${this.configFilePath}`);
            return { success: true, path: this.configFilePath };

        } catch (error) {
            this.log('error', `[配置提取] 提取配置文件失败: ${error.message}`);

            // 针对特定系统错误码返回友好的提示信息
            const errorMessages = {
                'EACCES': '权限不足，无法写入配置文件',
                'ENOENT': '路径不存在',
                'ENOSPC': '磁盘空间不足'
            };
            
            return { 
                success: false, 
                error: errorMessages[error.code] || error.message 
            };
        }
    }

    /**
     * 确保配置文件存在（若不存在则提取）
     * @returns {Object} 包含 success, existed, path 的结果对象
     */
    ensureConfigExists() {
        if (this.configExists()) {
            this.log('info', '[配置提取] 配置文件已存在，跳过提取');
            return { success: true, existed: true, path: this.configFilePath };
        }

        this.log('info', '[配置提取] 配置文件不存在，开始提取...');
        const result = this.extractConfig();
        return { ...result, existed: false };
    }
    
}

module.exports = ScheduleConfigExtractor;