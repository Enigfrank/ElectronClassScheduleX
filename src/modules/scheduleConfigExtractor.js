import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_NAME = 'electron-class-schedule-x';
const CONFIG_DIR_NAME = 'config';
const CONFIG_FILE_NAME = 'scheduleConfig.js';
const SOURCE_CONFIG_PATH = path.join(__dirname, '..', 'js', CONFIG_FILE_NAME);

class ScheduleConfigExtractor {
    constructor(logger = null) {
        this.logger = logger;
        this.configDir = null;
        this.configFilePath = null;
    }

    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        } else {
            console.log(`[${level.toUpperCase()}] ${message}`);
        }
    }

    getConfigDir() {
        if (this.configDir) {
            return this.configDir;
        }

        const appDataPath = app.getPath('appData');
        this.configDir = path.join(appDataPath, APP_NAME, CONFIG_DIR_NAME);
        return this.configDir;
    }

    getConfigFilePath() {
        if (this.configFilePath) {
            return this.configFilePath;
        }

        this.configFilePath = path.join(this.getConfigDir(), CONFIG_FILE_NAME);
        return this.configFilePath;
    }

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

    configExists() {
        const configPath = this.getConfigFilePath();
        return fs.existsSync(configPath);
    }

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

    ensureConfigExists() {
        if (this.configExists()) {
            this.log('info', '[配置提取] 配置文件已存在，跳过提取');
            return { success: true, existed: true, path: this.getConfigFilePath() };
        }

        this.log('info', '[配置提取] 配置文件不存在，开始提取...');
        const result = this.extractConfig();
        return { ...result, existed: false };
    }

    getConfigPath() {
        return this.getConfigFilePath();
    }
}

export default ScheduleConfigExtractor;
