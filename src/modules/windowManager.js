const { BrowserWindow, screen, Menu, ipcMain } = require('electron');
const path = require('path');

class WindowManager {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.windows = {
            main: null,
            gui: null,
            loading: null,
            shutdownWarning: null,
            oobe: null,
            devTools: null
        };
    }

    /**
     * 创建独立的开发者工具窗口
     * @param {BrowserWindow} targetWindow 目标窗口
     * @returns {BrowserWindow} 开发者工具窗口实例
     */
    createDevToolsWindow(targetWindow) {
        if (this.windows.devTools && !this.windows.devTools.isDestroyed()) {
            this.windows.devTools.show();
            this.windows.devTools.focus();
            return this.windows.devTools;
        }

        // 创建开发者工具窗口
        const devToolsWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            title: '开发者工具 - 电子课表',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        // 打开开发者工具并分离到独立窗口
        targetWindow.webContents.setDevToolsWebContents(devToolsWindow.webContents);
        targetWindow.webContents.openDevTools({ mode: 'detach' });

        devToolsWindow.on('close', () => {
            this.windows.devTools = null;
        });

        this.windows.devTools = devToolsWindow;
        return devToolsWindow;
    }

    /**
     * 关闭开发者工具窗口
     */
    closeDevToolsWindow() {
        if (this.windows.devTools && !this.windows.devTools.isDestroyed()) {
            this.windows.devTools.close();
            this.windows.devTools = null;
        }
    }

    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    createMainWindow() {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth } = primaryDisplay.workAreaSize;

        const win = new BrowserWindow({
            x: 0,
            y: 0,
            width: screenWidth,
            height: 120, // 保持固定高度
            frame: false,
            transparent: true,
            alwaysOnTop: this.configManager.getWindowAlwaysOnTop(),
            minimizable: false,
            maximizable: false,
            autoHideMenuBar: true,
            resizable: false,
            type: 'toolbar',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            },
        });

        win.loadFile(path.join(__dirname, '..', 'index.html')).catch(err => {
            this.log('error', `[窗口管理] 加载主窗口页面失败: ${err.message}`);
        });

        if (this.configManager.getWindowAlwaysOnTop()) {
            win.setAlwaysOnTop(true, 'screen-saver');
        }

        this.windows.main = win;
        return win;
    }

    createReactGUIWindow() {
        if (this.windows.gui && !this.windows.gui.isDestroyed()) {
            this.windows.gui.show();
            return this.windows.gui;
        }

        const guiWindow = new BrowserWindow({
            width: 1280,
            height: 780,
            minWidth: 900,
            minHeight: 650,
            title: '仪表盘',
            backgroundColor: '#f5f5f5',
            autoHideMenuBar: true,
            titleBarStyle: 'hiddenInset',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            }
        });

        guiWindow.loadFile(path.join(__dirname, '..', 'GUI.html'));

        guiWindow.once('ready-to-show', () => {
            guiWindow.show();
        });

        guiWindow.on('close', () => {
            this.windows.gui = null;
        });

        guiWindow.webContents.on('did-finish-load', () => {
            guiWindow.webContents.send('init', {
                isDuringClassCountdown: this.configManager.get('isDuringClassCountdown', true),
                isWindowAlwaysOnTop: this.configManager.getWindowAlwaysOnTop(),
                isDuringClassHidden: this.configManager.get('isDuringClassHidden', true),
                isAutoLaunch: this.configManager.getAutoLaunch(),
                scheduleShutdown: this.configManager.get('scheduleShutdown', false)
            });
        });

        this.windows.gui = guiWindow;
        return guiWindow;
    }

    createLoadingDialog(parentWindow) {
        const loadingDialog = new BrowserWindow({
            width: 600,
            height: 400,
            frame: false,
            alwaysOnTop: true,
            modal: true,
            parent: parentWindow,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        loadingDialog.loadFile(path.join(__dirname, '..', 'loading.html'));
        this.windows.loading = loadingDialog;
        return loadingDialog;
    }

    closeLoadingDialog() {
        if (this.windows.loading && !this.windows.loading.isDestroyed()) {
            this.windows.loading.close();
            this.windows.loading = null;
        }
    }

    setWindowAlwaysOnTop(win, alwaysOnTop) {
        if (win && !win.isDestroyed()) {
            win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
        }
    }

    hideMenuBar() {
        Menu.setApplicationMenu(null);
    }

    getWindow(type) {
        return this.windows[type];
    }

    closeAllWindows() {
        Object.values(this.windows).forEach(window => {
            if (window && !window.isDestroyed()) {
                window.close();
            }
        });
        this.windows = {
            main: null,
            gui: null,
            loading: null,
            shutdownWarning: null
        };
    }

    windowExists(type) {
        return this.windows[type] && !this.windows[type].isDestroyed();
    }

    /**
     * 创建OOBE引导窗口
     * @returns {BrowserWindow} OOBE窗口实例
     */
    createOobeWindow() {
        if (this.windows.oobe && !this.windows.oobe.isDestroyed()) {
            this.windows.oobe.show();
            return this.windows.oobe;
        }

        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        const windowWidth = 900;
        const windowHeight = 650;

        const oobeWindow = new BrowserWindow({
            width: windowWidth,
            height: windowHeight,
            x: Math.round((screenWidth - windowWidth) / 2),
            y: Math.round((screenHeight - windowHeight) / 2),
            frame: false,
            transparent: false,
            resizable: false,
            maximizable: false,
            minimizable: false,
            alwaysOnTop: false,
            backgroundColor: '#f5f5f5',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            }
        });

        oobeWindow.loadFile(path.join(__dirname, '..', 'oobe.html'));

        oobeWindow.once('ready-to-show', () => {
            oobeWindow.show();
        });

        oobeWindow.on('close', () => {
            this.windows.oobe = null;
        });

        this.windows.oobe = oobeWindow;
        return oobeWindow;
    }

    /**
     * 关闭OOBE窗口
     */
    closeOobeWindow() {
        if (this.windows.oobe && !this.windows.oobe.isDestroyed()) {
            this.windows.oobe.close();
            this.windows.oobe = null;
        }
    }
}

module.exports = WindowManager;