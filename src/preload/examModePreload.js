const { contextBridge, ipcRenderer } = require('electron');

/**
 * 订阅考试窗口初始化数据，并返回对应的清理函数。
 * @param {(entries: Array<Object>) => void} callback 初始化回调
 * @returns {() => void} 监听清理函数
 */
function onInit(callback) {
    if (typeof callback !== 'function') return () => {};
    const handler = (event, entries) => callback(entries);
    ipcRenderer.on('exam-mode-init', handler);
    return () => ipcRenderer.removeListener('exam-mode-init', handler);
}

/**
 * 请求主进程退出考试模式。
 * @returns {Promise<Object>} 退出结果
 */
function exitExamMode() {
    return ipcRenderer.invoke('exit-exam-mode');
}

/**
 * 通知主进程考试页面已经完成初始化订阅。
 */
function ready() {
    ipcRenderer.send('exam-mode-ready');
}

contextBridge.exposeInMainWorld('examMode', {
    onInit,
    exitExamMode,
    ready
});
