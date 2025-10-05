const Store = require('electron-store');

class ConfigManager {
    constructor() {
        this.store = new Store();
        this.defaultConfig = {
            isDuringClassCountdown: true,
            isWindowAlwaysOnTop: true,
            isDuringClassHidden: true,
            isAutoLaunch: true,
            scheduleShutdown: false,
            shutdownTimes: [],
            isFirstRun: true
        };
    }

    get(key, defaultValue = null) {
        const value = this.store.get(key);
        return value !== undefined ? value : (defaultValue !== null ? defaultValue : this.defaultConfig[key]);
    }

    set(key, value) {
        this.store.set(key, value);
    }

    getAll() {
        const config = {};
        for (const key in this.defaultConfig) {
            config[key] = this.get(key);
        }
        return config;
    }

    reset() {
        for (const key in this.defaultConfig) {
            this.store.delete(key);
        }
    }

    // 获取关机时间配置（兼容旧格式）
    getShutdownTimes() {
        const times = this.get('shutdownTimes', []);
        // 兼容旧格式：如果是字符串数组，转换为新格式
        if (times.length > 0 && typeof times[0] === 'string') {
            return times.map(time => ({ time, enabled: true }));
        }
        return times;
    }

    // 设置关机时间配置
    setShutdownTimes(times) {
        this.set('shutdownTimes', times);
    }

    // 获取窗口置顶配置
    getWindowAlwaysOnTop() {
        return this.get('isWindowAlwaysOnTop', true);
    }

    // 设置窗口置顶配置
    setWindowAlwaysOnTop(value) {
        this.set('isWindowAlwaysOnTop', value);
    }

    // 获取自启动配置
    getAutoLaunch() {
        return this.get('isAutoLaunch', true);
    }

    // 设置自启动配置
    setAutoLaunch(value) {
        this.set('isAutoLaunch', value);
    }

    // 获取是否首次运行
    getIsFirstRun() {
        return this.get('isFirstRun', true);
    }

    // 设置首次运行状态
    setIsFirstRun(value) {
        this.set('isFirstRun', value);
    }
}

module.exports = ConfigManager;