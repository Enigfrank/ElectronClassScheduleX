const Store = require('electron-store').default;

/**
 * 配置管理模块
 * 负责应用程序配置的读取、存储和管理
 */
class ConfigManager {
    /**
     * 构造函数
     * @param {Object} logger - 日志记录器实例
     */
    constructor(logger = null) {
        this.logger = logger;
        this.store = new Store();
        this.defaultConfig = {
            isDuringClassCountdown: true,
            isWindowAlwaysOnTop: true,
            isDuringClassHidden: true,
            isAutoLaunch: true,
            scheduleShutdown: false,
            shutdownTimes: [],
            examModeEntries: [],
            isFirstRun: true,
            isOobeCompleted: false,
            autoCheckUpdates: true,
            useUpdateProxy: true,
            updateProxyId: 'gh-proxy-v4',
            customUpdateProxyPrefix: ''
        };
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    log(level, message) {
        this.logger?.[level]?.(message);
    }

    /**
     * 获取配置项
     * @param {string} key - 配置键名
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    get(key, defaultValue) {
        const fallback = defaultValue ?? this.defaultConfig[key];
        return this.store.get(key, fallback);
    }

    /**
     * 设置配置项
     * @param {string} key - 配置键名
     * @param {*} value - 配置值
     */
    set(key, value) {
        this.store.set(key, value);
        this.log('info', `[配置管理] 设置 ${key} = ${JSON.stringify(value)}`);
    }

    /**
     * 获取所有配置
     * @returns {Object} 所有配置对象
     */
    getAll() {
        const config = {};
        for (const key of Object.keys(this.defaultConfig)) {
            config[key] = this.get(key);
        }
        return config;
    }

    /**
     * 重置所有配置为默认值
     */
    reset() {
        for (const key of Object.keys(this.defaultConfig)) {
            this.store.delete(key);
        }
        this.log('info', '[配置管理] 已重置所有配置为默认值');
    }

    /**
     * 获取关机时间配置（兼容旧格式）
     * @returns {Array} 关机时间列表
     */
    getShutdownTimes() {
        const times = this.get('shutdownTimes');
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

    getWindowAlwaysOnTop() {
        return this.get('isWindowAlwaysOnTop');
    }

    setWindowAlwaysOnTop(value) {
        this.set('isWindowAlwaysOnTop', value);
    }

    getAutoLaunch() {
        return this.get('isAutoLaunch');
    }

    setAutoLaunch(value) {
        this.set('isAutoLaunch', value);
    }

    getIsFirstRun() {
        return this.get('isFirstRun');
    }

    setIsFirstRun(value) {
        this.set('isFirstRun', value);
    }

    getOobeCompleted() {
        return this.get('isOobeCompleted');
    }

    setOobeCompleted(value) {
        this.set('isOobeCompleted', value);
    }

    /**
     * 获取在线更新配置。
     * @returns {Object} 在线更新配置
     */
    getUpdateSettings() {
        return {
            autoCheckUpdates: this.get('autoCheckUpdates'),
            useUpdateProxy: this.get('useUpdateProxy'),
            updateProxyId: this.get('updateProxyId'),
            customUpdateProxyPrefix: this.get('customUpdateProxyPrefix')
        };
    }

    /**
     * 保存在线更新配置。
     * @param {Object} settings 在线更新配置
     * @returns {Object} 保存后的配置
     */
    setUpdateSettings(settings = {}) {
        const allowedKeys = ['autoCheckUpdates', 'useUpdateProxy', 'updateProxyId', 'customUpdateProxyPrefix'];
        for (const key of allowedKeys) {
            if (Object.prototype.hasOwnProperty.call(settings, key)) {
                this.set(key, settings[key]);
            }
        }
        return this.getUpdateSettings();
    }
}

module.exports = ConfigManager;
