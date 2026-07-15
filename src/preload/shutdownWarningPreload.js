const { contextBridge, ipcRenderer } = require('electron');

/**
 * 订阅关机预警初始化数据，并返回对应的清理函数。
 * @param {(payload: {targetTime?: string}) => void} callback 初始化回调
 * @returns {() => void} 监听清理函数
 */
function onInit(callback) {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('shutdown-warning-init', handler);
    return () => ipcRenderer.removeListener('shutdown-warning-init', handler);
}

/**
 * 请求把当前关机计划延后 30 秒。
 */
function delay30() {
    ipcRenderer.send('shutdown-action', 'delay30');
}

/**
 * 请求把当前关机计划延后 60 秒。
 */
function delay60() {
    ipcRenderer.send('shutdown-action', 'delay60');
}

/**
 * 取消当前关机计划。
 */
function cancel() {
    ipcRenderer.send('shutdown-action', 'close');
}

contextBridge.exposeInMainWorld('shutdownWarningApi', {
    onInit,
    delay30,
    delay60,
    cancel
});
