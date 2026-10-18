/**
 * 注册窗口控制与鼠标穿透相关 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, windowManager: Object, screen: Electron.Screen, log: Function}} dependencies 注册依赖
 */
function registerWindowIpc({ ipcMain, windowManager, screen, log }) {
    let lastIgnoreMouseEvents = null;

    /**
     * 执行 GUI 自定义标题栏请求的窗口操作。
     * @param {Electron.IpcMainEvent} event IPC 事件
     * @param {string} action 窗口操作
     */
    function handleGuiWindowAction(event, action) {
        const guiWindow = windowManager.getWindow('gui');
        if (!guiWindow || (typeof guiWindow.isDestroyed === 'function' && guiWindow.isDestroyed())) return;

        switch (action) {
            case 'get-state':
                event.reply('gui-window-maximized-changed', guiWindow.isMaximized());
                break;
            case 'minimize':
                guiWindow.minimize();
                break;
            case 'toggle-maximize':
                if (guiWindow.isMaximized()) guiWindow.unmaximize();
                else guiWindow.maximize();
                break;
            case 'close':
                guiWindow.close();
                break;
            default:
                log('warn', `[IPC管理] 未知的 GUI 窗口操作: ${action}`);
        }
    }

    ipcMain.on('openSettingDialog', () => {
        log('info', '[IPC管理] 打开设置对话框');
        windowManager.getWindow('main')?.webContents.send('openSettingDialog');
    });

    ipcMain.on('openReactGUI', () => {
        log('info', '[IPC管理] 打开React GUI窗口');
        windowManager.createReactGUIWindow();
    });

    ipcMain.on('gui-window-action', handleGuiWindowAction);

    ipcMain.on('setDayOffset', () => {
        log('info', '[IPC管理] 设置日期偏移');
        windowManager.getWindow('main')?.webContents.send('setDayOffset');
    });

    ipcMain.on('openDevTools', () => {
        log('info', '[IPC管理] 打开开发者工具');
        const mainWindow = windowManager.getWindow('main');
        if (!mainWindow) return;
        windowManager.windowExists('devTools') ? windowManager.closeDevToolsWindow() : windowManager.createDevToolsWindow(mainWindow);
    });

    ipcMain.on('setIgnore', (event, arg) => {
        const mainWindow = windowManager.getWindow('main');
        if (!mainWindow) return;

        const ignoreMouseEvents = Boolean(arg);
        mainWindow.setIgnoreMouseEvents(ignoreMouseEvents, ignoreMouseEvents ? { forward: true } : undefined);
        lastIgnoreMouseEvents = ignoreMouseEvents;
    });
}

module.exports = registerWindowIpc;
