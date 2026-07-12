const fs = require('fs');
const { BrowserWindow, screen, app } = require('electron');
const path = require('path');

/**
 * 窗口管理模块
 * 负责应用程序中所有 Electron 窗口（主窗口、仪表盘、OOBE、加载框等）的创建、显示、关闭及层级管理
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
            oobe: null,
            devTools: null
        };
        this.mainAlwaysOnTopRestoreTimer = null;
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
     * 刷新窗口置顶层级
     * @param {BrowserWindow} win - 目标窗口
     */
    refreshWindowAlwaysOnTop(win) {
        if (!win || win.isDestroyed()) return;

        // 使用 screen-saver 层级，确保主窗口能压过普通窗口和多数全屏窗口
        win.setAlwaysOnTop(true, 'screen-saver');
        if (win.isVisible() && typeof win.moveTop === 'function') {
            win.moveTop();
        }
    }

    /**
     * 启动主窗口置顶恢复守护
     * Windows 全屏程序可能重排顶层窗口栈，因此需要定期重新声明主窗口置顶层级
     * @param {BrowserWindow} win - 主窗口实例
     */
    startMainWindowAlwaysOnTopGuard(win) {
        this.stopMainWindowAlwaysOnTopGuard();
        if (!win || win.isDestroyed() || !this.configManager.getWindowAlwaysOnTop()) return;

        this.refreshWindowAlwaysOnTop(win);
        this.mainAlwaysOnTopRestoreTimer = setInterval(() => {
            if (!win || win.isDestroyed() || !this.configManager.getWindowAlwaysOnTop()) {
                this.stopMainWindowAlwaysOnTopGuard();
                return;
            }

            this.refreshWindowAlwaysOnTop(win);
        // 每 2 秒刷新一次置顶层级，修复全屏程序重排 z-order 后置顶失效的问题
        }, 2000);
        this.mainAlwaysOnTopRestoreTimer.unref?.();
    }

    /**
     * 停止主窗口置顶恢复守护
     */
    stopMainWindowAlwaysOnTopGuard() {
        if (this.mainAlwaysOnTopRestoreTimer) {
            clearInterval(this.mainAlwaysOnTopRestoreTimer);
            this.mainAlwaysOnTopRestoreTimer = null;
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

        this.windows.main = win;
        win.on('closed', () => {
            this.stopMainWindowAlwaysOnTopGuard();
            if (this.windows.main === win) {
                this.windows.main = null;
            }
        });
        win.on('show', () => {
            if (this.configManager.getWindowAlwaysOnTop()) {
                this.refreshWindowAlwaysOnTop(win);
            }
        });

        this.setWindowAlwaysOnTop(win, this.configManager.getWindowAlwaysOnTop());
        return win;
    }

    /**
     * 销毁并重新创建主课表窗口，使 index.html 重新加载最新课表配置
     * @returns {BrowserWindow} 新创建或复用的主窗口实例
     */
    reloadMainScheduleWindow() {
        const currentWindow = this.windows.main;
        if (currentWindow && !currentWindow.isDestroyed()) {
            this.log('info', '[窗口管理] 重建主课表窗口: 销毁旧主窗口');
            currentWindow.destroy();
        } else {
            this.log('info', '[窗口管理] 重建主课表窗口: 未发现可销毁的旧主窗口');
        }

        const newWindow = this.createMainWindow();
        this.log('info', '[窗口管理] 重建主课表窗口: 新主窗口已创建');
        return newWindow;
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
            backgroundColor: '#f8f9fa',
            autoHideMenuBar: true,
            frame: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            }
        });

        const htmlPath = path.join(__dirname, '..', 'GUI.html');
        guiWindow.loadFile(htmlPath);

        /**
         * 把 GUI 窗口的最大化状态同步到自定义标题栏。
         */
        const sendGuiWindowMaximizedState = () => {
            if (!guiWindow.isDestroyed()) {
                guiWindow.webContents.send('gui-window-maximized-changed', guiWindow.isMaximized());
            }
        };

        guiWindow.on('maximize', sendGuiWindowMaximizedState);
        guiWindow.on('unmaximize', sendGuiWindowMaximizedState);

        const isDev = !app.isPackaged;
        let bundleWatcher = null;

        if (isDev) {
            // __dirname 是 src/modules，往上一级 '..' 是 src，再进入 dist 文件夹
            const bundlePath = path.join(__dirname, '..', 'dist', 'react-gui.bundle.iife.js');
            
            // 确保文件存在再监听，避免首次启动时 Webpack 还没编译完导致报错
            if (fs.existsSync(bundlePath)) {
                fs.watchFile(bundlePath, { interval: 500 }, (curr, prev) => {
                    if (curr.mtime !== prev.mtime) {
                        console.log('🔄 [开发环境] 检测到 React GUI 代码更新，正在自动刷新窗口...');
                        guiWindow.webContents.reload(); // 自动刷新窗口
                    }
                });
                bundleWatcher = bundlePath;
            } else {
                console.warn(`⚠️ [开发环境] 未找到 bundle 文件: ${bundlePath}，请先在 ECSX-Gui 目录下运行 npm run dev`);
            }
            
            // 开发环境自动打开 F12 开发者工具
            guiWindow.webContents.openDevTools({ mode: 'detach' });
        }

        guiWindow.once('ready-to-show', () => {
            guiWindow.show();
        });

        guiWindow.once('close', () => {
            this.windows.gui = null;
            // 窗口关闭时，取消文件监听，防止内存泄漏
            if (isDev && bundleWatcher) {
                fs.unwatchFile(bundleWatcher);
            }
        });

        guiWindow.webContents.once('did-finish-load', () => {
            guiWindow.webContents.send('init', {
                isDuringClassCountdown: this.configManager.get('isDuringClassCountdown', true),
                isWindowAlwaysOnTop: this.configManager.getWindowAlwaysOnTop(),
                isDuringClassHidden: this.configManager.get('isDuringClassHidden', true),
                isAutoLaunch: this.configManager.getAutoLaunch(),
                scheduleShutdown: this.configManager.get('scheduleShutdown', false)
            });
            sendGuiWindowMaximizedState();
        });

        this.windows.gui = guiWindow;
        return guiWindow;
    }

    /**
     * 设置指定窗口是否置顶
     * @param {BrowserWindow} win - 目标窗口
     * @param {boolean} alwaysOnTop - 是否置顶
     */
    setWindowAlwaysOnTop(win, alwaysOnTop) {
        if (!win || win.isDestroyed()) return;

        if (alwaysOnTop) {
            this.refreshWindowAlwaysOnTop(win);
            if (win === this.windows.main) {
                this.startMainWindowAlwaysOnTopGuard(win);
            }
        } else {
            if (win === this.windows.main) {
                this.stopMainWindowAlwaysOnTopGuard();
            }
            win.setAlwaysOnTop(false);
        }
    }

    /**
     * 获取指定类型的窗口实例
     * @param {string} type - 窗口类型标识（main, gui, etc.）
     * @returns {BrowserWindow|null}
     */
    getWindow(type) {
        return this.windows[type];
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
        const windowWidth = Math.min(1080, screenWidth);
        const windowHeight = Math.min(650, screenHeight);

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
            backgroundColor: '#f8f9fa',
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
