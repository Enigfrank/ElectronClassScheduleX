const Store = require('electron-store').default;

/**
 * 作业配置管理模块
 * 负责作业接收相关配置的统一管理，配置存储在 assignment-config.json 中
 */
class AssignmentConfigManager {
    /**
     * 构造函数
     * @param {Object} logger - 日志记录器实例
     */
    constructor(logger = null) {
        this.logger = logger;
        this.store = new Store({
            name: 'assignment-config',
            projectName: 'electron-class-schedule-x'
        });
        this.defaultConfig = {
            clientId: null,
            clientName: '',
            serverURL: 'http://localhost:3000',
            wsURL: 'ws://localhost:3000',
            assignmentEnabled: false,
            assignmentDisplayPeriod: -1
        };
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](`[作业配置] ${message}`);
        }
    }

    /**
     * 获取配置项
     * @param {string} key - 配置键名
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    get(key, defaultValue = null) {
        const value = this.store.get(key);
        return value !== undefined ? value : (defaultValue !== null ? defaultValue : this.defaultConfig[key]);
    }

    /**
     * 设置配置项
     * @param {string} key - 配置键名
     * @param {*} value - 配置值
     */
    set(key, value) {
        this.store.set(key, value);
        this.log('info', `设置 ${key} = ${JSON.stringify(value)}`);
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
     * 批量更新配置
     * @param {Object} newConfig - 新配置对象
     */
    updateConfig(newConfig) {
        for (const key in newConfig) {
            if (this.defaultConfig.hasOwnProperty(key)) {
                this.set(key, newConfig[key]);
            }
        }
        this.log('info', '配置已批量更新');
    }

    /**
     * 重置所有配置为默认值
     */
    reset() {
        this.store.clear();
        this.log('info', '配置已重置为默认值');
    }

    /**
     * 获取客户端唯一标识符
     * @returns {string|null} 客户端ID
     */
    getClientId() {
        return this.get('clientId', null);
    }

    /**
     * 设置客户端唯一标识符
     * @param {string} id - 客户端ID
     */
    setClientId(id) {
        this.set('clientId', id);
    }

    /**
     * 获取客户端显示名称
     * @returns {string} 客户端名称
     */
    getClientName() {
        return this.get('clientName', '');
    }

    /**
     * 设置客户端显示名称
     * @param {string} name - 客户端名称
     */
    setClientName(name) {
        this.set('clientName', name);
    }

    /**
     * 获取服务器地址
     * @returns {string} 服务器URL地址
     */
    getServerURL() {
        return this.get('serverURL', 'http://localhost:3000');
    }

    /**
     * 设置服务器地址
     * @param {string} url - 服务器URL地址
     */
    setServerURL(url) {
        this.set('serverURL', url);
        if (url && !this.get('wsURL')) {
            this.set('wsURL', url.replace('http', 'ws'));
        }
    }

    /**
     * 获取WebSocket地址
     * @returns {string} WebSocket URL地址
     */
    getWsURL() {
        return this.get('wsURL', 'ws://localhost:3000');
    }

    /**
     * 设置WebSocket地址
     * @param {string} url - WebSocket URL地址
     */
    setWsURL(url) {
        this.set('wsURL', url);
    }

    /**
     * 获取作业功能启用状态
     * @returns {boolean} 作业功能是否启用
     */
    getAssignmentEnabled() {
        return this.get('assignmentEnabled', false);
    }

    /**
     * 设置作业功能启用状态
     * @param {boolean} enabled - 是否启用作业功能
     */
    setAssignmentEnabled(enabled) {
        this.set('assignmentEnabled', enabled);
    }

    /**
     * 获取作业显示时机
     * @returns {number|string} 显示时机
     */
    getAssignmentDisplayPeriod() {
        return this.get('assignmentDisplayPeriod', -1);
    }

    /**
     * 设置作业显示时机
     * @param {number|string} period - 显示时机
     */
    setAssignmentDisplayPeriod(period) {
        this.set('assignmentDisplayPeriod', period);
    }

    /**
     * 检查客户端是否已注册
     * @returns {boolean} 是否已注册
     */
    isRegistered() {
        return this.getClientId() !== null;
    }

    /**
     * 清除客户端注册信息
     */
    clearRegistration() {
        this.set('clientId', null);
        this.set('clientName', '');
        this.log('info', '客户端注册信息已清除');
    }
}

module.exports = AssignmentConfigManager;
