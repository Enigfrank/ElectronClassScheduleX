const { app, Menu, ipcMain, dialog } = require('electron');

// 导入模块
const Logger = require('./logger');
const ConfigManager = require('./configManager');
const WindowManager = require('./windowManager');
const TrayManager = require('./trayManager');
const ShutdownScheduler = require('./shutdownScheduler');
const AutoLaunchManager = require('./autoLaunchManager');
const UpdateManager = require('./updateManager');
const Utils = require('./utils');
const IpcManager = require('./ipcManager');
const ScheduleConfigExtractor = require('./scheduleConfigExtractor');

/**
 * 应用生命周期管理器
 */
class AppLifecycleManager {
    constructor() {
        this.appInitialized = false;
        this.logger = null;
        this.configManager = null;
        this.utils = null;
        this.windowManager = null;
        this.trayManager = null;
        this.shutdownScheduler = null;
        this.autoLaunchManager = null;
        this.updateManager = null;
        this.ipcManager = null;
        this.scheduleConfigExtractor = null;
    }

    async start() {
        if (!this.checkSingleInstanceLock()) return;
        
        this.setupGlobalErrorHandler();
        await app.whenReady();
        console.log('应用准备就绪, 开始初始化...');
        
        // 初始化基础模块
        try {
            await this.initializeModules();
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const msg = `模块初始化失败，程序无法继续运行\n${errorMsg}`;
            console.error(msg);
            this.logger?.error(msg);
            if (error?.stack) this.logger?.error(error.stack);
            
            dialog.showErrorBox('启动错误', msg);
            app.exit(1); // 强制退出
            return;      
        }

        // 确保配置文件存在
        if (!this.ensureScheduleConfig()) {
            const msg = '配置文件初始化失败，程序无法继续运行';
            this.logger?.error(msg);
            dialog.showErrorBox('启动错误', msg);
            app.exit(1);
            return;
        }

        // 记录日志状态
        if (this.logger) {
            this.logger.info(`日志系统状态: ${JSON.stringify(this.logger.getStatus())}`);
            this.logger.info('应用启动完成, 开始加载配置...');
        }

        // 检查 OOBE
        const isOobeCompleted = this.configManager.getOobeCompleted();
        if (!isOobeCompleted) {
            this.showOobe();
        } else {
            await this.handleNormalStartup();
        }

        // 设置生命周期事件
        this.setupLifecycleEvents();
    }

    checkSingleInstanceLock() {
        const gotTheLock = app.requestSingleInstanceLock({ key: '电子课表' });
        if (!gotTheLock) {
            console.log('检测到另一个实例已在运行, 退出当前实例');
            app.quit();
            return false;
        }
        return true;
    }

    setupGlobalErrorHandler() {
        process.on('uncaughtException', (error) => {
            const errorMsg = `[Uncaught Exception] ${error.message}\nStack: ${error.stack}`;
            console.error(errorMsg);
            if (this.logger) {
                this.logger.error(errorMsg);
                try { this.logger.flush(); } catch (e) { console.error('Failed to flush logger:', e); }
            }
        });

        process.on('unhandledRejection', (reason) => {
            const errorMsg = `[Unhandled Rejection] ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : ''}`;
            console.error(errorMsg);
            this.logger?.error(errorMsg);
        });
    }

    async initializeModules() {
        this.logger = new Logger();
        await this.logger.initialize();

        this.scheduleConfigExtractor = new ScheduleConfigExtractor(this.logger);
        this.configManager = new ConfigManager(this.logger);
        this.utils = new Utils(this.logger);
        this.windowManager = new WindowManager(this.configManager, this.logger);
        this.shutdownScheduler = new ShutdownScheduler(this.configManager, this.logger);
        this.autoLaunchManager = new AutoLaunchManager(this.configManager, this.logger);
        this.updateManager = new UpdateManager({
            configManager: this.configManager,
            logger: this.logger,
            windowManager: this.windowManager
        });
        this.updateManager.initialize();
        this.trayManager = new TrayManager(null, this.logger, this.windowManager, this.updateManager);

        this.ipcManager = new IpcManager(
            this.configManager, this.logger, this.windowManager,
            this.trayManager, this.shutdownScheduler, this.autoLaunchManager, this.updateManager
        );

        this.logger.info('所有模块初始化完成');
    }

    ensureScheduleConfig() {
        const result = this.scheduleConfigExtractor.ensureConfigExists();
        return result.success;
    }

    async handleNormalStartup() {
        try {
            await this.initializeApp();
        } catch (error) {
            const msg = `初始化失败: ${error instanceof Error ? error.message : String(error)}`;
            this.logger?.error(msg);
            if (error?.stack) this.logger?.error(error.stack);
            console.error(msg);
            dialog.showErrorBox('启动错误', msg);
            app.quit();
        }
    }

    async initializeApp() {
        if (this.appInitialized) {
            this.logger?.warn('应用已经初始化, 跳过重复初始化');
            return;
        }
        this.appInitialized = true;
        this.logger?.info('开始初始化应用');

        const win = this.initializeMainWindow();
        Menu.setApplicationMenu(null);

        win.webContents.on('did-finish-load', () => {
            win.webContents.send('getWeekIndex');
        });

        // 使用通用方法替代重复代码
        this._safeInit(this.autoLaunchManager, 'setAutoLaunch', '自启动模块');
        this._safeInit(this.shutdownScheduler, 'initialize', '关机调度模块');
        
        try {
            if (this.utils && this.trayManager) {
                this.trayManager.createTray(this.utils.getAssetPath('image', 'icon.png'));
            }
        } catch (error) {
            this.logger?.error(`[启动流程] 托盘模块初始化失败: ${error.message}`);
        }

        this.updateManager?.startAutoCheck();

        this.logger?.info('应用初始化完成');
    }

    _safeInit(manager, methodName, moduleName) {
        try {
            if (manager && typeof manager[methodName] === 'function') {
                manager[methodName]();
            }
        } catch (error) {
            this.logger?.error(`[启动流程] ${moduleName}初始化失败: ${error.message}`);
        }
    }

    initializeMainWindow() {
        const win = this.windowManager.createMainWindow();
        if (!win || win.isDestroyed()) throw new Error('主窗口创建失败');
        return win;
    }

    showOobe() {
        this.logger?.info('[OOBE] 显示OOBE引导窗口');
        this.windowManager.createOobeWindow();
    }

    async onOobeComplete() {
        this.logger?.info('[OOBE] OOBE完成回调触发, 开始启动主应用');
        await this.initializeApp();
    }

    setupLifecycleEvents() {
        ipcMain.on('oobe-finished', () => this.onOobeComplete());

        app.on('before-quit', () => {
            this.logger?.info('应用正在退出...');
            this.logger?.flush();
            this.logger?.cleanupOldLogs();

            this.trayManager?.destroy();
        });

        app.on('window-all-closed', () => {
            const hasTray = this.trayManager?.hasTray?.();
            if (process.platform !== 'darwin' && !hasTray) {
                app.quit();
            } else {
                this.logger?.info('[生命周期] 所有窗口已关闭,应用保持后台运行');
            }
        });
    }

    getModules() {
        return {
            logger: this.logger,
            configManager: this.configManager,
            windowManager: this.windowManager,
            trayManager: this.trayManager,
            shutdownScheduler: this.shutdownScheduler,
            autoLaunchManager: this.autoLaunchManager,
            updateManager: this.updateManager,
            utils: this.utils,
            scheduleConfigExtractor: this.scheduleConfigExtractor
        };
    }
}

module.exports = AppLifecycleManager;
