const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

const RENDERER_READY_TIMEOUT_MS = 10000;

/**
 * 管理考试模式窗口及正常窗口的幂等隐藏与恢复。
 */
class ExamModeWindowController {
    /**
     * @param {{windowManager: Object, configManager: Object, logger?: Object}} dependencies 控制器依赖
     */
    constructor({ windowManager, configManager, logger = null }) {
        this.windowManager = windowManager;
        this.configManager = configManager;
        this.logger = logger;
        this.examWindow = null;
        this.enterPromise = null;
        this.normalWindowsHidden = false;
        this.isRestoring = false;
        this.isAppQuitting = false;

        app.on('before-quit', () => {
            this.isAppQuitting = true;
        });
    }

    /**
     * 记录考试窗口生命周期日志。
     * @param {string} level 日志级别
     * @param {string} message 日志内容
     */
    log(level, message) {
        this.logger?.[level]?.(message);
    }

    /**
     * 获取当前有效的考试窗口。
     * @returns {BrowserWindow|null} 考试窗口
     */
    getWindow() {
        if (!this.examWindow || this.examWindow.isDestroyed()) return null;
        return this.examWindow;
    }

    /**
     * 判断考试模式是否已经接管正常窗口。
     * @returns {boolean} 是否处于考试模式
     */
    isActive() {
        return this.normalWindowsHidden && this.getWindow() !== null;
    }

    /**
     * 根据 GUI 所在位置选择目标显示器。
     * @returns {Electron.Display} 目标显示器
     */
    getTargetDisplay() {
        const guiWindow = this.windowManager.getWindow('gui');
        if (guiWindow && !guiWindow.isDestroyed()) {
            try {
                return screen.getDisplayMatching(guiWindow.getBounds());
            } catch (error) {
                this.log('warn', `[考试模式] 无法根据 GUI 选择显示器，将使用主显示器: ${error.message}`);
            }
        }
        return screen.getPrimaryDisplay();
    }

    /**
     * 创建隐藏的考试窗口并绑定异常恢复事件。
     * @returns {BrowserWindow} 新考试窗口
     */
    createExamWindow() {
        const display = this.getTargetDisplay();
        const bounds = display?.bounds || screen.getPrimaryDisplay().bounds;
        const examWindow = new BrowserWindow({
            ...bounds,
            show: false,
            frame: false,
            fullscreen: true,
            fullscreenable: true,
            autoHideMenuBar: true,
            backgroundColor: '#000000',
            alwaysOnTop: true,
            skipTaskbar: true,
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload', 'examModePreload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                backgroundThrottling: false
            }
        });

        this.examWindow = examWindow;
        examWindow.on('closed', () => {
            if (this.examWindow === examWindow) this.examWindow = null;
            this.restoreNormalWindows();
        });
        examWindow.webContents.on('render-process-gone', (event, details) => {
            this.log('error', `[考试模式] 展示进程异常退出: ${details?.reason || 'unknown'}`);
            if (!examWindow.isDestroyed()) examWindow.destroy();
        });

        return examWindow;
    }

    /**
     * 等待考试 renderer 完成脚本初始化和 IPC 订阅。
     * @param {BrowserWindow} examWindow 考试窗口
     * @returns {Promise<void>} renderer 就绪
     */
    waitForRendererReady(examWindow) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('考试页面初始化超时'));
            }, RENDERER_READY_TIMEOUT_MS);

            /**
             * 清理 renderer 就绪监听。
             */
            function cleanup() {
                clearTimeout(timeout);
                examWindow.webContents.removeListener('ipc-message', handleIpcMessage);
                examWindow.removeListener('closed', handleClosed);
            }

            /**
             * 处理 renderer 发来的就绪消息。
             * @param {Electron.Event} event Electron 事件
             * @param {string} channel IPC 通道
             */
            function handleIpcMessage(event, channel) {
                if (channel !== 'exam-mode-ready') return;
                cleanup();
                resolve();
            }

            /**
             * 在 renderer 就绪前窗口关闭时终止进入流程。
             */
            function handleClosed() {
                cleanup();
                reject(new Error('考试窗口在初始化完成前已关闭'));
            }

            examWindow.webContents.on('ipc-message', handleIpcMessage);
            examWindow.once('closed', handleClosed);
        });
    }

    /**
     * 隐藏顶部课表和 GUI，并停止主窗口置顶守护。
     */
    hideNormalWindows() {
        if (this.normalWindowsHidden) return;
        this.normalWindowsHidden = true;

        try {
            this.windowManager.stopMainWindowAlwaysOnTopGuard();
            const mainWindow = this.windowManager.getWindow('main');
            const guiWindow = this.windowManager.getWindow('gui');
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
            if (guiWindow && !guiWindow.isDestroyed()) guiWindow.hide();
        } catch (error) {
            this.restoreNormalWindows();
            throw error;
        }
    }

    /**
     * 幂等恢复顶部课表和原 GUI 窗口。
     */
    restoreNormalWindows() {
        if (!this.normalWindowsHidden || this.isRestoring || this.isAppQuitting) return;
        this.isRestoring = true;
        this.normalWindowsHidden = false;

        try {
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
                this.windowManager.setWindowAlwaysOnTop(
                    mainWindow,
                    this.configManager.getWindowAlwaysOnTop()
                );
            }

            const guiWindow = this.windowManager.getWindow('gui');
            if (guiWindow && !guiWindow.isDestroyed()) {
                guiWindow.show();
                guiWindow.focus();
            }
            this.log('info', '[考试模式] 已恢复顶部课表和 GUI 窗口');
        } catch (error) {
            this.log('error', `[考试模式] 恢复正常窗口失败: ${error.message}`);
        } finally {
            this.isRestoring = false;
        }
    }

    /**
     * 加载并进入考试模式；并发调用复用同一个进入流程。
     * @param {Array<Object>} entries 已规范化考试条目
     * @returns {Promise<BrowserWindow>} 已显示的考试窗口
     */
    enter(entries) {
        if (this.enterPromise) return this.enterPromise;
        this.enterPromise = this.performEnter(entries).finally(() => {
            this.enterPromise = null;
        });
        return this.enterPromise;
    }

    /**
     * 执行一次考试窗口加载和窗口状态切换。
     * @param {Array<Object>} entries 已规范化考试条目
     * @returns {Promise<BrowserWindow>} 已显示的考试窗口
     */
    async performEnter(entries) {
        const existingWindow = this.getWindow();
        if (existingWindow) {
            existingWindow.webContents.send('exam-mode-init', entries);
            existingWindow.show();
            existingWindow.focus();
            return existingWindow;
        }

        const examWindow = this.createExamWindow();
        const rendererReady = this.waitForRendererReady(examWindow);
        try {
            await Promise.all([
                examWindow.loadFile(path.join(__dirname, '..', 'exam-mode.html')),
                rendererReady
            ]);
            if (examWindow.isDestroyed()) throw new Error('考试窗口在加载完成前已关闭');

            examWindow.webContents.send('exam-mode-init', entries);
            this.hideNormalWindows();
            examWindow.setFullScreen(true);
            examWindow.setAlwaysOnTop(true, 'screen-saver');
            examWindow.show();
            examWindow.focus();
            examWindow.moveTop?.();
            this.log('info', '[考试模式] 考试窗口已进入全屏展示');
            return examWindow;
        } catch (error) {
            if (!examWindow.isDestroyed()) examWindow.destroy();
            if (this.examWindow === examWindow) this.examWindow = null;
            this.restoreNormalWindows();
            this.log('error', `[考试模式] 考试窗口启动失败: ${error.message}`);
            throw error;
        }
    }

    /**
     * 退出考试模式并恢复正常窗口。
     */
    exit() {
        const examWindow = this.getWindow();
        if (examWindow && !examWindow.isDestroyed()) examWindow.destroy();
        if (this.examWindow === examWindow) this.examWindow = null;
        this.restoreNormalWindows();
    }
}

module.exports = ExamModeWindowController;
