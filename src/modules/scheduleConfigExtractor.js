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
        this.configDir = null;
        this.configFilePath = null;
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    log(level, message) {
        if (this.logger) {
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
        if (this.configDir) {
            return this.configDir;
        }

        const appDataPath = app.getPath('appData');
        this.configDir = path.join(appDataPath, APP_NAME, CONFIG_DIR_NAME);
        return this.configDir;
    }

    /**
     * 获取配置文件路径
     * @returns {string} 配置文件的绝对路径
     */
    getConfigFilePath() {
        if (this.configFilePath) {
            return this.configFilePath;
        }

        this.configFilePath = path.join(this.getConfigDir(), CONFIG_FILE_NAME);
        return this.configFilePath;
    }

    /**
     * 确保目录存在，如果不存在则创建
     * @param {string} dirPath - 目录路径
     * @returns {boolean} 是否存在或创建成功
     */
    ensureDirectoryExists(dirPath) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                this.log('info', `[配置提取] 创建配置目录: ${dirPath}`);
            }
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
        const configPath = this.getConfigFilePath();
        return fs.existsSync(configPath);
    }

    /**
     * 提取默认配置文件到应用数据目录
     * @returns {Object} 包含 success, error 或 path 的结果对象
     */
    extractConfig() {
        const configPath = this.getConfigFilePath();
        const configDir = this.getConfigDir();

        try {
            if (!this.ensureDirectoryExists(configDir)) {
                return { success: false, error: '无法创建配置目录' };
            }

            if (!fs.existsSync(SOURCE_CONFIG_PATH)) {
                this.log('error', `[配置提取] 源配置文件不存在: ${SOURCE_CONFIG_PATH}`);
                return { success: false, error: '源配置文件不存在' };
            }

            const configContent = fs.readFileSync(SOURCE_CONFIG_PATH, 'utf-8');

            fs.writeFileSync(configPath, configContent, 'utf-8');

            this.log('info', `[配置提取] 配置文件已提取到: ${configPath}`);
            return { success: true, path: configPath };

        } catch (error) {
            this.log('error', `[配置提取] 提取配置文件失败: ${error.message}`);

            if (error.code === 'EACCES') {
                return { success: false, error: '权限不足，无法写入配置文件' };
            } else if (error.code === 'ENOENT') {
                return { success: false, error: '路径不存在' };
            } else if (error.code === 'ENOSPC') {
                return { success: false, error: '磁盘空间不足' };
            }

            return { success: false, error: error.message };
        }
    }

    /**
     * 确保配置文件存在（若不存在则提取）
     * @returns {Object} 包含 success, existed, path 的结果对象
     */
    ensureConfigExists() {
        if (this.configExists()) {
            this.log('info', '[配置提取] 配置文件已存在，跳过提取');
            return { success: true, existed: true, path: this.getConfigFilePath() };
        }

        this.log('info', '[配置提取] 配置文件不存在，开始提取...');
        const result = this.extractConfig();
        return { ...result, existed: false };
    }

    /**
     * 获取配置文件当前路径（同 getConfigFilePath）
     * @returns {string}
     */
    getConfigPath() {
        return this.getConfigFilePath();
    }
}

module.exports = ScheduleConfigExtractor;
