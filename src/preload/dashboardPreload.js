const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
    'addShutdownTime',
    'deleteShutdownTime',
    'getTimeOffset',
    'gui-window-action',
    'open-external-link',
    'open-logs-folder',
    'open-oobe',
    'openDevTools',
    'openSettingDialog',
    'quitApp',
    'resetSettings',
    'setAutoLaunch',
    'setClassCountdown',
    'setDayOffset',
    'setDuringClassHidden',
    'setWeekIndex',
    'setWindowAlwaysOnTop',
    'showMoreInfo',
    'toggleShutdownTime'
]);

const INVOKE_CHANNELS = new Set([
    'apply-exam-mode',
    'apply-schedule-config',
    'check-for-updates',
    'download-update',
    'export-schedule-config-source',
    'get-exam-mode-config',
    'get-logs',
    'get-update-settings',
    'get-update-status',
    'getShutdownTimes',
    'import-schedule-config-source',
    'install-update',
    'load-schedule-config',
    'read-schedule-config-source',
    'save-schedule-config-source',
    'set-update-settings',
    'test-update-sources'
]);

const RECEIVE_CHANNELS = new Set([
    'gui-window-maximized-changed',
    'init',
    'shutdownTimesUpdated',
    'update-status-changed',
    'updateCheckbox'
]);

/**
 * 验证 Dashboard renderer 是否允许访问指定 IPC 通道。
 * @param {Set<string>} allowedChannels 允许的通道集合
 * @param {string} channel 待访问通道
 * @param {string} operation IPC 操作名称
 */
function assertAllowedChannel(allowedChannels, channel, operation) {
    if (!allowedChannels.has(channel)) {
        throw new Error(`Unsupported dashboard IPC ${operation} channel: ${channel}`);
    }
}

const dashboardApi = {
    /**
     * 向主进程发送白名单内的 Dashboard 消息。
     * @param {string} channel IPC 通道
     * @param {...*} args 可序列化参数
     */
    send(channel, ...args) {
        assertAllowedChannel(SEND_CHANNELS, channel, 'send');
        ipcRenderer.send(channel, ...args);
    },

    /**
     * 调用白名单内的 Dashboard 请求处理器。
     * @param {string} channel IPC 通道
     * @param {...*} args 可序列化参数
     * @returns {Promise<*>} 主进程返回值
     */
    invoke(channel, ...args) {
        assertAllowedChannel(INVOKE_CHANNELS, channel, 'invoke');
        return ipcRenderer.invoke(channel, ...args);
    },

    /**
     * 订阅白名单内的主进程推送，并隐藏特权 Electron 事件对象。
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

contextBridge.exposeInMainWorld('dashboardApi', dashboardApi);
