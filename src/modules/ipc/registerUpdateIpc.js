/**
 * 获取在线更新管理器，缺失时抛出明确业务错误。
 * @param {Object|null} updateManager 在线更新管理器
 * @returns {Object} 可用的在线更新管理器
 */
function getUpdateManagerOrThrow(updateManager) {
    if (updateManager) {
        return updateManager;
    }

    throw new Error('在线更新服务当前不可用，请稍后重试');
}

/**
 * 注册在线更新相关 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, updateManager: Object|null}} dependencies 注册依赖
 */
function registerUpdateIpc({ ipcMain, updateManager }) {
    ipcMain.handle('get-update-settings', () => getUpdateManagerOrThrow(updateManager).getUpdateSettings());
    ipcMain.handle('set-update-settings', (event, settings) => getUpdateManagerOrThrow(updateManager).setUpdateSettings(settings));
    ipcMain.handle('get-update-status', () => getUpdateManagerOrThrow(updateManager).getStatus());
    ipcMain.handle('check-for-updates', () => getUpdateManagerOrThrow(updateManager).checkForUpdates({ isManual: true }));
    ipcMain.handle('download-update', () => getUpdateManagerOrThrow(updateManager).downloadUpdate());
    ipcMain.handle('install-update', () => getUpdateManagerOrThrow(updateManager).installUpdate());
    ipcMain.handle('test-update-sources', () => getUpdateManagerOrThrow(updateManager).testUpdateSources());
}

module.exports = registerUpdateIpc;
