const { contextBridge, ipcRenderer } = require('electron');

/**
 * 请求主进程打开课表配置目录。
 */
function openConfigFolder() {
    ipcRenderer.send('oobe-open-config-folder');
}

/**
 * 通知主进程首次使用引导已经完成。
 */
function complete() {
    ipcRenderer.send('oobe-complete');
}

contextBridge.exposeInMainWorld('oobeApi', {
    openConfigFolder,
    complete
});
