const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
    'mini-countdown-ready',
    'mini-countdown-drag'
]);

const INVOKE_CHANNELS = new Set([
    'load-schedule-config',
    'mini-countdown-pull-state',
    'mini-countdown-pull-background-tone'
]);

const RECEIVE_CHANNELS = new Set([
    'mini-countdown-state',
    'mini-countdown-background-tone'
]);

/**
 * 验证迷你倒计时窗口是否允许访问指定 IPC 通道。
 * @param {Set<string>} allowedChannels 允许的通道集合
 * @param {string} channel 待访问通道
 * @param {string} operation IPC 操作名称
 */
function assertAllowedChannel(allowedChannels, channel, operation) {
    if (!allowedChannels.has(channel)) {
        throw new Error(`Unsupported mini countdown IPC ${operation} channel: ${channel}`);
    }
}

const miniCountdownApi = {
    /**
     * 向主进程发送白名单内的迷你倒计时消息。
     * @param {string} channel IPC 通道
     * @param {...*} args 可序列化参数
     */
    send(channel, ...args) {
        assertAllowedChannel(SEND_CHANNELS, channel, 'send');
        ipcRenderer.send(channel, ...args);
    },

    /**
     * 调用白名单内的迷你倒计时请求处理器。
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

contextBridge.exposeInMainWorld('miniCountdownApi', miniCountdownApi);
