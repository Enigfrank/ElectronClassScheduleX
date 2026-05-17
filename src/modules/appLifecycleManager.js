const { app, BrowserWindow, Menu, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');

// 导入模块
const Logger = require('./logger');
const ConfigManager = require('./configManager');
const AssignmentConfigManager = require('./assignmentConfigManager');
const WindowManager = require('./windowManager');
const TrayManager = require('./trayManager');
const ShutdownScheduler = require('./shutdownScheduler');
const AutoLaunchManager = require('./autoLaunchManager');
const Utils = require('./utils');
const IpcManager = require('./ipcManager');
const ScheduleConfigExtractor = require('./scheduleConfigExtractor');
const ClientManager = require('./clientManager');
const AssignmentWindowManager = require('./assignmentWindowManager');
const AssignmentManager = require('./assignmentManager');

/**
 * 应用生命周期管理器
 * 负责应用启动、初始化、生命周期事件监听和模块管理
 */
class AppLifecycleManager {
    /**
     * 构造函数
     */
    constructor() {
        this.appInitialized = false;
        this.loadingDialog = null;
        this.logger = null;
        this.configManager = null;
        this.assignmentConfigManager = null;
        this.utils = null;
        this.windowManager = null;
        this.trayManager = null;
        this.shutdownScheduler = null;
        this.autoLaunchManager = null;
        this.ipcManager = null;
        this.scheduleConfigExtractor = null;
        this.clientManager = null;
        this.assignmentWindowManager = null;
        this.assignmentManager = null;
    }

    /**
     * 启动应用逻辑
     */
    async start() {
        // 检查单例锁
        if (!this.checkSingleInstanceLock()) {
            return;
        }
        // 全局异常处理
        this.setupGlobalErrorHandler();
        await app.whenReady();
        this.logToConsole('应用准备就绪, 开始初始化...');
        // 初始化基础模块（失败时立即中断启动，避免后续空对象访问）
        try {
            await this.initializeModules();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const msg = `模块初始化失败，程序无法继续运行。\n${errorMsg}`;
            this.logToConsole(msg);
            if (this.logger) {
                this.logger.error(msg);
                if (error && error.stack) {
                    this.logger.error(error.stack);
                }
            }
            dialog.showErrorBox('启动错误', msg);
        }
        // 注册自定义协议
        this.registerConfigProtocol();
        // 确保配置文件存在
        if (!this.ensureScheduleConfig()) {
            const msg = '配置文件初始化失败，程序无法继续运行。';
            if (this.logger) this.logger.error(msg);
            dialog.showErrorBox('启动错误', msg);
            app.quit();
            return;
        }
        // 记录日志系统状态
        if (this.logger) {
            const logStatus = this.logger.getStatus();
            this.logger.info(`日志系统状态: ${JSON.stringify(logStatus)}`);
            this.logger.info('应用启动完成, 开始加载配置...');
        }
        // 检查OOBE是否已完成
        const isOobeCompleted = this.configManager.getOobeCompleted();
        if (!isOobeCompleted) {
            this.showOobe();
        } else {
            await this.handleNormalStartup();
        }
        // 设置生命周期事件
        this.setupLifecycleEvents();
    }

    /**
     * 检查单例锁
     * @returns {boolean} 是否获取到锁
     */
    checkSingleInstanceLock() {
        const gotTheLock = app.requestSingleInstanceLock({ key: '电子课表' });

        if (!gotTheLock) {
            this.logToConsole('检测到另一个实例已在运行, 退出当前实例。');
            app.quit();
            return false;
        }

        app.on('second-instance', (event, commandLine, workingDirectory) => {
            this.logToConsole('收到第二个实例的启动请求, 正在聚焦主窗口...');
            const win = this.windowManager ? this.windowManager.getWindow('main') : null;
            if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();
                win.show();
            }
        });

        return true;
    }

    /**
     * 全局异常处理
     */
    setupGlobalErrorHandler() {
        process.on('uncaughtException', (error) => {
            const errorMsg = `[Uncaught Exception] ${error.message}\nStack: ${error.stack}`;
            console.error(errorMsg);
            if (this.logger) {
                this.logger.error(errorMsg);
                try {
                    this.logger.flush();
                } catch (e) {
                    console.error('Failed to flush logger:', e);
                }
            }
        });

        process.on('unhandledRejection', (reason, promise) => {
            const errorMsg = `[Unhandled Rejection] ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : ''}`;
            console.error(errorMsg);
            if (this.logger) {
                this.logger.error(errorMsg);
            }
        });
    }

    /**
     * 初始化所有模块
     * @throws {Error} 当任意关键模块初始化失败时抛出异常
     */
    async initializeModules() {
        try {
            // 创建并初始化日志模块
            this.logger = new Logger();
            await this.logger.initialize();

            this.scheduleConfigExtractor = new ScheduleConfigExtractor(this.logger);
            this.configManager = new ConfigManager(this.logger);
            this.assignmentConfigManager = new AssignmentConfigManager(this.logger);
            this.utils = new Utils(this.logger);
            this.windowManager = new WindowManager(this.configManager, this.logger);
            this.trayManager = new TrayManager(this.configManager, this.logger, this.windowManager);
            this.shutdownScheduler = new ShutdownScheduler(this.configManager, this.logger);
            this.autoLaunchManager = new AutoLaunchManager(this.configManager, this.logger);
            this.clientManager = new ClientManager(this.assignmentConfigManager, this.logger);
            this.assignmentWindowManager = new AssignmentWindowManager(this.assignmentConfigManager, this.logger);

            this.ipcManager = new IpcManager(
                this.configManager,
                this.assignmentConfigManager,
                this.logger,
                this.windowManager,
                this.trayManager,
                this.shutdownScheduler,
                this.autoLaunchManager,
                this.clientManager,
                this.assignmentWindowManager
            );

            this.assignmentManager = new AssignmentManager(
                this.assignmentConfigManager,
                this.clientManager,
                this.assignmentWindowManager,
                this.ipcManager,
                this.logger
            );

            this.logger.info('所有模块初始化完成');
        } catch (error) {
            const message = `模块初始化失败: ${error instanceof Error ? error.message : String(error)}`;
            this.logToConsole(message);
            if (this.logger) {
                this.logger.error(message);
                if (error && error.stack) {
                    this.logger.error(error.stack);
                }
            }
            throw error;
        }
    }

    /**
     * 注册自定义配置协议
     */
    registerConfigProtocol() {
        protocol.handle('config', (request) => {
            const url = request.url.substr(8);
            const configDir = this.scheduleConfigExtractor.getConfigDir();
            const filePath = path.join(configDir, url);

            return net.fetch(`file://${filePath}`);
        });
    }

    /**
     * 确保课表配置文件存在
     * @returns {boolean} 是否提取成功
     */
    ensureScheduleConfig() {
        if (!this.scheduleConfigExtractor) {
            this.scheduleConfigExtractor = new ScheduleConfigExtractor(this.logger);
        }
        const result = this.scheduleConfigExtractor.ensureConfigExists();
        return result.success;
    }

    /**
     * 处理正常启动流程
     */
    async handleNormalStartup() {
        this.showLoadingDialog();

        // 稍微延迟一点初始化, 给加载对话框显示的时间
        await new Promise(resolve => setTimeout(resolve, 1000));

        try {
            await this.initializeApp();
            if (this.loadingDialog && !this.loadingDialog.isDestroyed()) {
                this.loadingDialog.close();
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const msg = `初始化失败: ${errorMsg}`;
            if (this.logger) {
                this.logger.error(msg);
                if (error.stack) this.logger.error(error.stack);
            }
            this.logToConsole(msg);
            dialog.showErrorBox('启动错误', msg);
            app.quit();
        }
    }

    /**
     * 初始化主应用逻辑
     */
    async initializeApp() {
        if (this.appInitialized) {
            if (this.logger) this.logger.warn('应用已经初始化, 跳过重复初始化');
            return;
        }

        this.appInitialized = true;

        if (this.logger) {
            this.logger.info('开始初始化应用');
        }

        // 创建主窗口
        const win = this.initializeMainWindow();
        Menu.setApplicationMenu(null);

        win.webContents.on('did-finish-load', () => {
            win.webContents.send('getWeekIndex');
        });

        this.initializeAutoLaunchModule();
        this.initializeShutdownModule();
        this.initializeTrayModule();
        this.initializeAssignmentModule();

        if (this.logger) {
            this.logger.info('应用初始化完成');
        }
    }

    /**
     * 初始化主窗口并挂载崩溃保护监听
     * @returns {Electron.BrowserWindow} 主窗口实例
     */
    initializeMainWindow() {
        const win = this.windowManager.createMainWindow();
        if (!win || win.isDestroyed()) {
            throw new Error('主窗口创建失败');
        }
        return win;
    }

    /**
     * 初始化自启动模块
     */
    initializeAutoLaunchModule() {
        try {
            if (this.autoLaunchManager) {
                this.autoLaunchManager.setAutoLaunch();
            }
        } catch (error) {
            if (this.logger) {
                this.logger.error(`[启动流程] 自启动模块初始化失败: ${error.message}`);
            }
        }
    }

    /**
     * 初始化关机调度模块（非致命）
     */
    initializeShutdownModule() {
        try {
            if (this.shutdownScheduler) {
                this.shutdownScheduler.initialize();
            }
        } catch (error) {
            if (this.logger) {
                this.logger.error(`[启动流程] 关机调度模块初始化失败: ${error.message}`);
            }
        }
    }

    /**
     * 初始化托盘模块
     */
    initializeTrayModule() {
        try {
            if (!this.utils || !this.trayManager) {
                return;
            }
            const iconPath = this.utils.getAssetPath('image', 'icon.png');
            this.trayManager.createTray(iconPath);
        } catch (error) {
            if (this.logger) {
                this.logger.error(`[启动流程] 托盘模块初始化失败: ${error.message}`);
            }
        }
    }

    /**
     * 初始化作业管理模块（非致命）
     */
    initializeAssignmentModule() {
        try {
            if (this.assignmentManager) {
                this.assignmentManager.initialize();
            }
        } catch (error) {
            if (this.logger) {
                this.logger.error(`[启动流程] 作业管理模块初始化失败: ${error.message}`);
            }
        }
    }

    /**
     * 显示加载对话框
     */
    showLoadingDialog() {
        const win = this.windowManager ? this.windowManager.getWindow('main') : null;
        this.loadingDialog = new BrowserWindow({
            width: 600,
            height: 400,
            frame: false,
            alwaysOnTop: true,
            modal: win ? true : false,
            parent: win || undefined,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        this.loadingDialog.loadFile(path.join(__dirname, '..', 'loading.html'));
    }

    /**
     * 显示OOBE引导窗口
     */
    showOobe() {
        if (this.logger) {
            this.logger.info('[OOBE] 显示OOBE引导窗口');
        }
        this.windowManager.createOobeWindow();
    }

    /**
     * OOBE完成回调
     */
    async onOobeComplete() {
        if (this.logger) {
            this.logger.info('[OOBE] OOBE完成回调触发, 开始启动主应用');
        }
        await this.initializeApp();
    }

    /**
     * 设置生命周期事件监听
     */
    setupLifecycleEvents() {
        // OOBE完成事件监听
        ipcMain.on('oobe-finished', () => {
            this.onOobeComplete();
        });

        // 应用退出前清理
        app.on('before-quit', () => {
            if (this.logger) {
                this.logger.info('应用正在退出...');
                this.logger.flush();
                this.logger.cleanupOldLogs();
            }

            if (this.clientManager) {
                this.clientManager.destroy();
            }

            if (this.assignmentWindowManager) {
                this.assignmentWindowManager.hideWindow();
            }

            if (this.assignmentManager) {
                this.assignmentManager.destroy();
            }

            if (this.trayManager) {
                this.trayManager.destroy();
            }
        });

        app.on('window-all-closed', () => {
            const hasTray = this.trayManager && typeof this.trayManager.hasTray === 'function' && this.trayManager.hasTray();
            if (process.platform !== 'darwin' && !hasTray) {
                app.quit();
            } else if (this.logger) {
                this.logger.info('[生命周期] 所有窗口已关闭，但托盘可用，应用保持后台运行');
            }
        });
    }

    /**
     * 辅助控制台日志
     */
    logToConsole(...args) {
        console.log(...args);
    }

    getModules() {
        return {
            logger: this.logger,
            configManager: this.configManager,
            assignmentConfigManager: this.assignmentConfigManager,
            windowManager: this.windowManager,
            trayManager: this.trayManager,
            shutdownScheduler: this.shutdownScheduler,
            autoLaunchManager: this.autoLaunchManager,
            utils: this.utils,
            scheduleConfigExtractor: this.scheduleConfigExtractor,
            clientManager: this.clientManager,
            assignmentWindowManager: this.assignmentWindowManager,
            assignmentManager: this.assignmentManager
        };
    }
}

module.exports = AppLifecycleManager;
