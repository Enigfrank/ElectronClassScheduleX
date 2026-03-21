const { BrowserWindow, screen, Menu, ipcMain } = require('electron');
const path = require('path');

/**
 * 窗口管理模块
 * 负责应用程序中所有 Electron 窗口（主窗口、仪表盘、OOBE、加载框等）的创建、显示、关闭及层级管理。
 */
class WindowManager {
    /**
     * @param {ConfigManager} configManager - 配置管理器实例
     * @param {Object} logger - 日志记录器实例
     */
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

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    /**
     * 创建并初始化主窗口
     * 主窗口是一个横向贯穿屏幕顶部的半透明、响应式窗口
     * @returns {BrowserWindow} 主窗口实例
     */
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

    /**
     * 创建并初始化 React GUI (仪表盘) 窗口
     * 该窗口用于用户进行详细配置和查看状态
     * @returns {BrowserWindow} GUI 窗口实例
     */
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

    /**
     * 创建加载状态对话框
     * @param {BrowserWindow} parentWindow - 父窗口
     * @returns {BrowserWindow} 加载窗口实例
     */
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

    /**
     * 关闭并销毁当前加载对话框
     */
    closeLoadingDialog() {
        if (this.windows.loading && !this.windows.loading.isDestroyed()) {
            this.windows.loading.close();
            this.windows.loading = null;
        }
    }

    /**
     * 设置指定窗口是否置顶
     * @param {BrowserWindow} win - 目标窗口
     * @param {boolean} alwaysOnTop - 是否置顶
     */
    setWindowAlwaysOnTop(win, alwaysOnTop) {
        if (win && !win.isDestroyed()) {
            win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
        }
    }

    /**
     * 彻底隐藏应用程序菜单栏
     */
    hideMenuBar() {
        Menu.setApplicationMenu(null);
    }

    /**
     * 获取指定类型的窗口实例
     * @param {string} type - 窗口类型标识（main, gui, loading, etc.）
     * @returns {BrowserWindow|null}
     */
    getWindow(type) {
        return this.windows[type];
    }

    /**
     * 关闭并注销所有当前管理的窗口
     */
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

    /**
     * 检查特定类型的窗口是否正在运行且未被销毁
     * @param {string} type - 窗口类型
     * @returns {boolean}
     */
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