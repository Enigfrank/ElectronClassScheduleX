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
            shutdownWarning: null
        };
    }

    // 创建主窗口
    createMainWindow() {
        const win = new BrowserWindow({
            x: 0,
            y: 0,
            width: screen.getPrimaryDisplay().workAreaSize.width,
            height: 200,
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
            this.logger.error('Failed to load index.html:', err);
        });

        if (this.configManager.getWindowAlwaysOnTop()) {
            win.setAlwaysOnTop(true, 'screen-saver');
        }

        this.windows.main = win;
        return win;
    }

    // 创建GUI窗口
    createGUIWindow() {
        if (this.windows.gui && !this.windows.gui.isDestroyed()) {
            this.windows.gui.show();
            return this.windows.gui;
        }

        const guiWindow = new BrowserWindow({
            width: 1280,
            height: 900,
            title: '课表配置界面',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            }
        });

        guiWindow.loadFile(path.join(__dirname, '..', 'GUI.html'));
        
        guiWindow.on('close', () => {
            this.windows.gui = null;
        });

        // 在窗口加载完成后，发送初始化数据
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

    // 创建React GUI窗口
    createReactGUIWindow() {
        if (this.windows.gui && !this.windows.gui.isDestroyed()) {
            this.windows.gui.show();
            return this.windows.gui;
        }

        const guiWindow = new BrowserWindow({
            width: 980,
            height: 800,
            title: '课表配置界面 - React',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            }
        });

        guiWindow.loadFile(path.join(__dirname, '..', 'GUI-react.html'));
        
        guiWindow.on('close', () => {
            this.windows.gui = null;
        });

        // 在窗口加载完成后，发送初始化数据
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

    // 创建加载对话框
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

    // 关闭加载对话框
    closeLoadingDialog() {
        if (this.windows.loading && !this.windows.loading.isDestroyed()) {
            this.windows.loading.close();
            this.windows.loading = null;
        }
    }

    // 设置窗口置顶
    setWindowAlwaysOnTop(win, alwaysOnTop) {
        if (win && !win.isDestroyed()) {
            win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
        }
    }

    // 隐藏菜单栏
    hideMenuBar() {
        Menu.setApplicationMenu(null);
    }

    // 获取窗口实例
    getWindow(type) {
        return this.windows[type];
    }

    // 关闭所有窗口
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

    // 检查窗口是否存在
    windowExists(type) {
        return this.windows[type] && !this.windows[type].isDestroyed();
    }
}

module.exports = WindowManager;