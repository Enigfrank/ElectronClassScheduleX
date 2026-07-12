/**
 * 注册课表与应用设置相关 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, configManager: Object, windowManager: Object, trayManager: Object, shutdownScheduler: Object, autoLaunchManager: Object}} dependencies 注册依赖
 */
function registerSettingsIpc({
    ipcMain,
    configManager,
    windowManager,
    trayManager,
    shutdownScheduler,
    autoLaunchManager
}) {
    ipcMain.on('getWeekIndex', () => trayManager.updateTrayMenu());

    ipcMain.on('setWeekIndex', (event, index) => {
        windowManager.getWindow('main')?.webContents.send('setWeekIndex', index);
    });

    ipcMain.on('setClassCountdown', (event, checked) => {
        configManager.set('isDuringClassCountdown', checked);
        windowManager.getWindow('main')?.webContents.send('ClassCountdown', checked);
        trayManager.updateTrayMenu();
    });

    ipcMain.on('setWindowAlwaysOnTop', (event, checked) => {
        configManager.setWindowAlwaysOnTop(checked);
        const mainWindow = windowManager.getWindow('main');
        if (mainWindow) windowManager.setWindowAlwaysOnTop(mainWindow, checked);
        trayManager.updateTrayMenu();
    });

    ipcMain.on('setDuringClassHidden', (event, checked) => {
        configManager.set('isDuringClassHidden', checked);
        windowManager.getWindow('main')?.webContents.send('ClassHidden', checked);
        trayManager.updateTrayMenu();
    });

    ipcMain.on('setAutoLaunch', (event, checked) => {
        configManager.setAutoLaunch(checked);
        autoLaunchManager.setAutoLaunch();
        trayManager.updateTrayMenu();
    });

    ipcMain.on('setScheduleShutdown', (event, checked) => {
        configManager.set('scheduleShutdown', checked);
        checked ? shutdownScheduler.scheduleShutdown() : shutdownScheduler.cancelScheduledShutdown();
        trayManager.updateTrayMenu();
    });
}

module.exports = registerSettingsIpc;
