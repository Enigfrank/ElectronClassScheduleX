/**
 * 注册窗口控制与鼠标穿透相关 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, windowManager: Object, screen: Electron.Screen, log: Function}} dependencies 注册依赖
 */
function registerWindowIpc({ ipcMain, windowManager, screen, log }) {
    let interactiveRect = null;
    let checkTimer = null;
    let isDragging = false;

    /**
     * 根据当前鼠标位置更新主窗口的穿透状态。
     */
    function checkMousePosition() {
        if (isDragging) return;
        const mainWindow = windowManager.getWindow('main');
        if (!mainWindow || mainWindow.isDestroyed()) {
            if (checkTimer) {
                clearInterval(checkTimer);
                checkTimer = null;
            }
            return;
        }

        try {
            const point = screen.getCursorScreenPoint();
            const bounds = mainWindow.getBounds();

            if (interactiveRect) {
                const absoluteRect = {
                    x: bounds.x + interactiveRect.x,
                    y: bounds.y + interactiveRect.y,
                    width: interactiveRect.width,
                    height: interactiveRect.height
                };
                const padding = 5;
                const inArea = point.x >= absoluteRect.x - padding && point.x <= absoluteRect.x + absoluteRect.width + padding &&
                               point.y >= absoluteRect.y - padding && point.y <= absoluteRect.y + absoluteRect.height + padding;

                mainWindow.setIgnoreMouseEvents(!inArea, inArea ? undefined : { forward: true });
            }
        } catch (error) {
            log('warn', `[IPC管理] 鼠标位置检测异常: ${error.message}`);
        }
    }

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
        if (mainWindow) mainWindow.setIgnoreMouseEvents(arg, arg ? { forward: true } : undefined);
    });

    ipcMain.on('updateInteractiveRect', (event, rect) => {
        interactiveRect = rect;
        if (rect) {
            if (!checkTimer) checkTimer = setInterval(checkMousePosition, 25);
        } else {
            if (checkTimer) {
                clearInterval(checkTimer);
                checkTimer = null;
            }
            const mainWindow = windowManager.getWindow('main');
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIgnoreMouseEvents(true, { forward: true });
        }
    });

    ipcMain.on('setDragState', (event, state) => {
        isDragging = state;
        const mainWindow = windowManager.getWindow('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (isDragging) mainWindow.setIgnoreMouseEvents(false);
            else checkMousePosition();
        }
    });
}

module.exports = registerWindowIpc;
