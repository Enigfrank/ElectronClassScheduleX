const { validateMiniCountdownGlassStyle } = require('../../shared/miniCountdownGlassStyle');

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

    /**
     * 仅接受 Dashboard 的布尔设置，并保存窗口管理器实际接受的效果状态。
     * @param {Electron.IpcMainEvent} event IPC 事件
     * @param {boolean} enabled 是否启用迷你倒计时液态玻璃
     */
    function handleMiniCountdownLiquidGlass(event, enabled) {
        const guiWindow = windowManager.getWindow('gui');
        if (typeof enabled !== 'boolean' || !guiWindow || event.sender !== guiWindow.webContents) return;

        const accepted = windowManager.setMiniCountdownLiquidGlass(enabled);
        configManager.set('isMiniCountdownLiquidGlass', accepted);
        event.reply('updateCheckbox', { id: 'isMiniCountdownLiquidGlass', checked: accepted });
    }

    ipcMain.on('setMiniCountdownLiquidGlass', handleMiniCountdownLiquidGlass);

    /** 只允许当前 Dashboard 窗口读取和修改玻璃样式。 */
    function isGuiSender(event) {
        const guiWindow = windowManager.getWindow('gui');
        return Boolean(guiWindow && event.sender === guiWindow.webContents);
    }

    /** 读取已应用并保存的样式，异常以 IPC 失败结果返回。 */
    ipcMain.handle('get-mini-countdown-glass-style', event => {
        if (!isGuiSender(event)) return { success: false, error: '仅允许设置窗口读取玻璃样式' };
        try {
            return { success: true, style: windowManager.getMiniCountdownGlassStyle() };
        } catch (error) {
            return { success: false, error: error?.message || String(error) };
        }
    });

    /** 校验后应用原生样式，保存失败时恢复旧样式并返回错误。 */
    ipcMain.handle('set-mini-countdown-glass-style', (event, value) => {
        if (!isGuiSender(event)) return { success: false, error: '仅允许设置窗口修改玻璃样式' };
        const result = validateMiniCountdownGlassStyle(value);
        if (!result.success) return result;
        let previous;
        let applied = false;
        try {
            previous = windowManager.getMiniCountdownGlassStyle();
            if (!windowManager.setMiniCountdownGlassStyle(result.style)) {
                return { success: false, error: '迷你倒计时玻璃样式应用失败' };
            }
            applied = true;
            configManager.set('miniCountdownGlassStyle', result.style);
            return result;
        } catch (error) {
            if (applied) {
                try { windowManager.setMiniCountdownGlassStyle(previous); } catch { /* 保留原始保存错误。 */ }
            }
            return { success: false, error: error?.message || String(error) };
        }
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
