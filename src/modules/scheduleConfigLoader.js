const fs = require('fs');
const vm = require('vm');
const { validateScheduleConfig } = require('./scheduleConfigValidator');

/**
 * 课表配置加载器
 * 负责读取用户 scheduleConfig.js、在隔离上下文中解析配置对象，并返回校验结果
 */
class ScheduleConfigLoader {
    /**
     * @param {string} configFilePath - 用户课表配置文件路径
     * @param {Object} logger - 日志记录器实例
     */
    constructor(configFilePath, logger = null) {
        this.configFilePath = configFilePath;
        this.logger = logger;
    }

    /**
     * 记录加载器日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志内容
     */
    log(level, message) {
        this.logger?.[level]?.(message);
    }

    /**
     * 克隆配置对象，避免沙箱对象原型泄漏给调用方
     * @param {Object} config - 课表配置对象
     * @returns {Object} 深拷贝后的配置对象
     */
    cloneConfig(config) {
        return JSON.parse(JSON.stringify(config));
    }

    /**
     * 在隔离上下文中执行配置文件并提取配置对象
     * @param {string} source - 配置文件源码
     * @returns {Object} 提取出的课表配置
     */
    evaluateConfig(source) {
        const sandbox = {};
        vm.createContext(sandbox);
        vm.runInContext(`${source}\n;globalThis.__ecsxScheduleConfig = typeof _scheduleConfig !== 'undefined' ? _scheduleConfig : scheduleConfig;`, sandbox, {
            filename: this.configFilePath,
            timeout: 1000
        });

        return sandbox.__ecsxScheduleConfig;
    }

    /**
     * 读取、解析并校验课表配置
     * @returns {{success: true, config: Object, filePath: string}|{success: false, error: Object}} 加载结果
     */
    load() {
        let source;
        try {
            source = fs.readFileSync(this.configFilePath, 'utf8');
        } catch (error) {
            this.log('error', `[课表配置] 读取失败: ${error.message}`);
            return {
                success: false,
                error: {
                    type: 'read',
                    title: '课表配置读取失败',
                    message: error.message,
                    filePath: this.configFilePath
                }
            };
        }

        let config;
        try {
            config = this.cloneConfig(this.evaluateConfig(source));
        } catch (error) {
            this.log('error', `[课表配置] 语法错误: ${error.message}`);
            return {
                success: false,
                error: {
                    type: 'syntax',
                    title: '课表配置语法错误',
                    message: `语法错误: ${error.message}`,
                    filePath: this.configFilePath
                }
            };
        }

        const details = validateScheduleConfig(config);
        if (details.length > 0) {
            this.log('error', `[课表配置] 校验失败: ${details.map((item) => `${item.path}: ${item.message}`).join('; ')}`);
            return {
                success: false,
                error: {
                    type: 'validation',
                    title: '课表配置内容错误',
                    message: '课表配置结构无法被应用使用',
                    filePath: this.configFilePath,
                    details
                }
            };
        }

        return {
            success: true,
            config,
            filePath: this.configFilePath
        };
    }
}

module.exports = ScheduleConfigLoader;
