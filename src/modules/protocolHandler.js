const { ipcMain } = require('electron');

/**
 * 协议处理模块
 * 负责注册自定义协议
 */
class ProtocolHandler {
    /**
     * @param {ScheduleConfigExtractor} scheduleConfigExtractor
     */
    constructor(scheduleConfigExtractor) {
        this.scheduleConfigExtractor = scheduleConfigExtractor;
    }

    /**
     * 注册自定义配置协议
     * 允许通过 config:// 协议访问课表配置文件
     */
    register() {
        const { protocol, net } = require('electron');
        const path = require('path');

        protocol.handle('config', (request) => {
            const url = request.url.substr(8);
            const configDir = this.scheduleConfigExtractor.getConfigDir();
            const filePath = path.join(configDir, url);

            return net.fetch(`file://${filePath}`);
        });
    }
}

module.exports = ProtocolHandler;
