const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
    'mini-countdown-hint-ready'
]);

const INVOKE_CHANNELS = new Set([
    'load-schedule-config',
    'mini-countdown-hint-pull-state',
    'mini-countdown-hint-pull-background-tone'
]);

const RECEIVE_CHANNELS = new Set([
    'mini-countdown-hint-state',
    'mini-countdown-hint-background-tone'
]);

/**
 * 验证提示玻璃窗口是否允许访问指定 IPC 通道。
 * @param {Set<string>} allowedChannels 允许的通道集合
 * @param {string} channel 待访问通道
 * @param {string} operation IPC 操作名称
 */
function assertAllowedChannel(allowedChannels, channel, operation) {
    if (!allowedChannels.has(channel)) {
        throw new Error(`Unsupported mini countdown hint IPC ${operation} channel: ${channel}`);
    }
}

const miniCountdownHintApi = {
    /**
     * 向主进程发送白名单内的提示消息。
     * @param {string} channel IPC 通道
     * @param {...*} args 可序列化参数
     */
    send(channel, ...args) {
        assertAllowedChannel(SEND_CHANNELS, channel, 'send');
        ipcRenderer.send(channel, ...args);
    },

    /**
     * 调用白名单内的提示窗口请求处理器。
     * @param {string} channel IPC 通道
     * @param {...*} args 可序列化参数
     * @returns {Promise<*>} 主进程返回值
     */
    invoke(channel, ...args) {
        assertAllowedChannel(INVOKE_CHANNELS, channel, 'invoke');
        return ipcRenderer.invoke(channel, ...args);
    },

    /**
     * 订阅白名单内的主进程推送。
     * @param {string} channel IPC 通道
     * @param {Function} listener renderer 回调
     * @returns {() => void} 监听清理函数
     */
    on(channel, listener) {
        assertAllowedChannel(RECEIVE_CHANNELS, channel, 'receive');
        if (typeof listener !== 'function') throw new TypeError('IPC listener must be a function');

        const wrapper = (event, ...args) => listener(undefined, ...args);
        ipcRenderer.on(channel, wrapper);
        return () => ipcRenderer.removeListener(channel, wrapper);
    }
};

contextBridge.exposeInMainWorld('miniCountdownHintApi', miniCountdownHintApi);
