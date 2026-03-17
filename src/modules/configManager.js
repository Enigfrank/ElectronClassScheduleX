const Store = require('electron-store').default;

/**
 * 配置管理模块
 * 负责应用程序配置的读取、存储和管理
 * 注意：作业相关配置已移至 AssignmentConfigManager 统一管理
 */
class ConfigManager {
    /**
     * 构造函数
     * @param {Object} logger - 日志记录器实例
     */
    constructor(logger = null) {
        this.logger = logger;
        this.defaultConfig = {
            isDuringClassCountdown: true,
            isWindowAlwaysOnTop: true,
            isDuringClassHidden: true,
            isAutoLaunch: true,
            scheduleShutdown: false,
            shutdownTimes: [],
            isFirstRun: true,
            isOobeCompleted: false
        };
        
        // 初始化配置存储，添加错误处理
        try {
            this.store = new Store();
            this.storeAvailable = true;
        } catch (error) {
            console.error('配置存储初始化失败，使用内存存储:', error);
            if (logger) {
                logger.error('配置存储初始化失败，使用内存存储：' + error.message);
            }
            // 降级到内存存储
            this.store = new Map();
            this.storeAvailable = false;
        }
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    /**
     * 获取配置项
     * @param {string} key - 配置键名
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    get(key, defaultValue = null) {
        try {
            if (this.storeAvailable) {
                const value = this.store.get(key);
                return value !== undefined ? value : (defaultValue !== null ? defaultValue : this.defaultConfig[key]);
            } else {
                // 内存存储降级模式
                return this.store.has(key) ? this.store.get(key) : (defaultValue !== null ? defaultValue : this.defaultConfig[key]);
            }
        } catch (error) {
            console.error('获取配置失败:', error);
            if (this.logger) {
                this.logger.error('获取配置失败：' + error.message);
            }
            return defaultValue !== null ? defaultValue : this.defaultConfig[key];
        }
    }

    /**
     * 设置配置项
     * @param {string} key - 配置键名
     * @param {*} value - 配置值
     */
    set(key, value) {
        try {
            if (this.storeAvailable) {
                this.store.set(key, value);
            } else {
                // 内存存储降级模式
                this.store.set(key, value);
            }
            this.log('info', `[配置管理] 设置 ${key} = ${JSON.stringify(value)}`);
        } catch (error) {
            console.error('设置配置失败:', error);
            if (this.logger) {
                this.logger.error('设置配置失败：' + error.message);
            }
        }
    }

    /**
     * 获取所有配置
     * @returns {Object} 所有配置对象
     */
    getAll() {
        const config = {};
        for (const key in this.defaultConfig) {
            config[key] = this.get(key);
        }
        return config;
    }

    /**
     * 重置所有配置为默认值
     */
    reset() {
        try {
            for (const key in this.defaultConfig) {
                if (this.storeAvailable) {
                    this.store.delete(key);
                } else {
                    this.store.delete(key);
                }
            }
            this.log('info', '[配置管理] 已重置所有配置为默认值');
        } catch (error) {
            console.error('重置配置失败:', error);
            if (this.logger) {
                this.logger.error('重置配置失败：' + error.message);
            }
        }
    }

    /**
     * 获取关机时间配置（兼容旧格式）
     * @returns {Array} 关机时间列表
     */
    getShutdownTimes() {
        const times = this.get('shutdownTimes', []);
        if (times.length > 0 && typeof times[0] === 'string') {
            return times.map(time => ({ time, enabled: true }));
        }
        return times;
    }

    /**
     * 设置关机时间配置
     * @param {Array} times - 关机时间列表
     */
    setShutdownTimes(times) {
        this.set('shutdownTimes', times);
    }

    /**
     * 获取窗口置顶配置
     * @returns {boolean} 是否窗口置顶
     */
    getWindowAlwaysOnTop() {
        return this.get('isWindowAlwaysOnTop', true);
    }

    /**
     * 设置窗口置顶配置
     * @param {boolean} value - 是否窗口置顶
     */
    setWindowAlwaysOnTop(value) {
        this.set('isWindowAlwaysOnTop', value);
    }

    /**
     * 获取自启动配置
     * @returns {boolean} 是否开机自启动
     */
    getAutoLaunch() {
        return this.get('isAutoLaunch', true);
    }

    /**
     * 设置自启动配置
     * @param {boolean} value - 是否开机自启动
     */
    setAutoLaunch(value) {
        this.set('isAutoLaunch', value);
    }

    /**
     * 获取是否首次运行
     * @returns {boolean} 是否首次运行
     */
    getIsFirstRun() {
        return this.get('isFirstRun', true);
    }

    /**
     * 设置首次运行状态
     * @param {boolean} value - 是否首次运行
     */
    setIsFirstRun(value) {
        this.set('isFirstRun', value);
    }

    /**
     * 获取OOBE是否已完成
     * @returns {boolean} OOBE是否已完成
     */
    getOobeCompleted() {
        return this.get('isOobeCompleted', false);
    }

    /**
     * 设置OOBE完成状态
     * @param {boolean} value - OOBE是否已完成
     */
    setOobeCompleted(value) {
        this.set('isOobeCompleted', value);
    }
}

module.exports = ConfigManager;
