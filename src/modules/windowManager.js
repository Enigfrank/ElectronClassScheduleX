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

    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    createMainWindow() {
        this.log('info', '[窗口管理] 开始创建主窗口');
        
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
            this.log('error', `[窗口管理] 加载主窗口页面失败: ${err.message}`);
        });

        if (this.configManager.getWindowAlwaysOnTop()) {
            win.setAlwaysOnTop(true, 'screen-saver');
        }

        this.windows.main = win;
        this.log('info', '[窗口管理] 主窗口创建成功');
        return win;
    }

    createReactGUIWindow() {
        if (this.windows.gui && !this.windows.gui.isDestroyed()) {
            this.windows.gui.show();
            this.log('info', '[窗口管理] 显示已存在的GUI窗口');
            return this.windows.gui;
        }

        this.log('info', '[窗口管理] 开始创建GUI窗口');

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
            this.log('info', '[窗口管理] GUI窗口已显示');
        });

        guiWindow.on('close', () => {
            this.log('info', '[窗口管理] GUI窗口已关闭');
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
        this.log('info', '[窗口管理] GUI窗口创建成功');
        return guiWindow;
    }

    createLoadingDialog(parentWindow) {
        this.log('info', '[窗口管理] 创建加载对话框');
        
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
            this.log('info', '[窗口管理] 加载对话框已关闭');
        }
    }

    setWindowAlwaysOnTop(win, alwaysOnTop) {
        if (win && !win.isDestroyed()) {
            win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
            this.log('info', `[窗口管理] 设置窗口置顶: ${alwaysOnTop}`);
        }
    }

    hideMenuBar() {
        Menu.setApplicationMenu(null);
        this.log('info', '[窗口管理] 菜单栏已隐藏');
    }

    getWindow(type) {
        return this.windows[type];
    }

    closeAllWindows() {
        this.log('info', '[窗口管理] 关闭所有窗口');
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
}

module.exports = WindowManager;