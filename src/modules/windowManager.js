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
            this.log('info', '[窗口管理] 显示已存在的开发者工具窗口');
            return this.windows.devTools;
        }

        this.log('info', '[窗口管理] 开始创建开发者工具窗口');

        // 获取目标窗口的调试URL
        const debugUrl = targetWindow.webContents.getURL();

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
            this.log('info', '[窗口管理] 开发者工具窗口已关闭');
            this.windows.devTools = null;
        });

        this.windows.devTools = devToolsWindow;
        this.log('info', '[窗口管理] 开发者工具窗口创建成功');
        return devToolsWindow;
    }

    /**
     * 关闭开发者工具窗口
     */
    closeDevToolsWindow() {
        if (this.windows.devTools && !this.windows.devTools.isDestroyed()) {
            this.windows.devTools.close();
            this.windows.devTools = null;
            this.log('info', '[窗口管理] 开发者工具窗口已关闭');
        }
    }

    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    /**
     * 计算主窗口的合适宽度
     * 根据课程数量、sidebar和countdownContainer动态计算窗口宽度
     * @returns {number} 计算后的窗口宽度
     */
    calculateMainWindowWidth() {
        const primaryDisplay = screen.getPrimaryDisplay();
        const screenWidth = primaryDisplay.workAreaSize.width;

        // 默认显示3个课程，每个课程大约需要200px宽度
        const baseWidth = 3 * 200;

        // 添加sidebar宽度（左右各一个sidebar）
        const sidebarWidth = 2 * 100; // 每个sidebar大约100px

        // 添加countdownContainer宽度
        const countdownWidth = 300; // countdownContainer大约300px

        // 添加边距和间距
        const spacing = 100; // 额外的间距

        const totalWidth = baseWidth + sidebarWidth + countdownWidth + spacing;

        // 确保窗口宽度不超过屏幕宽度的80%，也不小于最小宽度
        const maxWidth = screenWidth * 0.8;
        const minWidth = 800;

        return Math.max(minWidth, Math.min(totalWidth, maxWidth));
    }

    /**
     * 计算窗口在屏幕顶部中央的位置
     * @param {number} windowWidth 窗口宽度
     * @returns {Object} 包含x和y坐标的对象
     */
    calculateMainWindowPosition(windowWidth) {
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth } = primaryDisplay.workAreaSize;

        // 窗口在屏幕顶部中央，顶部间隔由CSS中的--top-space变量控制
        const x = Math.round((screenWidth - windowWidth) / 2);
        const y = 0;

        return { x, y };
    }

    /**
     * 设置窗口为全屏宽度
     */
    setWindowFullScreenWidth() {
        const mainWindow = this.getWindow('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width: screenWidth } = primaryDisplay.workAreaSize;

            mainWindow.setBounds({
                x: 0,
                y: 0,
                width: screenWidth,
                height: 200
            });

        
        }
    }

    /**
     * 设置窗口为动态宽度
     */
    setWindowDynamicWidth() {
        const mainWindow = this.getWindow('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            const windowWidth = this.calculateMainWindowWidth();
            const { x, y } = this.calculateMainWindowPosition(windowWidth);

            mainWindow.setBounds({
                x: x,
                y: y,
                width: windowWidth,
                height: 200
            });

        }
    }

    createMainWindow() {
        this.log('info', '[窗口管理] 开始创建主窗口');

        // 动态计算窗口宽度和位置
        const windowWidth = this.calculateMainWindowWidth();
        const { x, y } = this.calculateMainWindowPosition(windowWidth);

        const win = new BrowserWindow({
            x: x,
            y: y,
            width: windowWidth,
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

    /**
     * 创建OOBE引导窗口
     * @returns {BrowserWindow} OOBE窗口实例
     */
    createOobeWindow() {
        if (this.windows.oobe && !this.windows.oobe.isDestroyed()) {
            this.windows.oobe.show();
            this.log('info', '[窗口管理] 显示已存在的OOBE窗口');
            return this.windows.oobe;
        }

        this.log('info', '[窗口管理] 开始创建OOBE窗口');

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
            this.log('info', '[窗口管理] OOBE窗口已显示');
        });

        oobeWindow.on('close', () => {
            this.log('info', '[窗口管理] OOBE窗口已关闭');
            this.windows.oobe = null;
        });

        this.windows.oobe = oobeWindow;
        this.log('info', '[窗口管理] OOBE窗口创建成功');
        return oobeWindow;
    }

    /**
     * 关闭OOBE窗口
     */
    closeOobeWindow() {
        if (this.windows.oobe && !this.windows.oobe.isDestroyed()) {
            this.windows.oobe.close();
            this.windows.oobe = null;
            this.log('info', '[窗口管理] OOBE窗口已关闭');
        }
    }
}

module.exports = WindowManager;