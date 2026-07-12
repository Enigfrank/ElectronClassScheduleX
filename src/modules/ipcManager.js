const { ipcMain, dialog, BrowserWindow, shell, app, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const prompt = require('electron-prompt');
const ScheduleConfigExtractor = require('./scheduleConfigExtractor');
const ScheduleConfigLoader = require('./scheduleConfigLoader');
const { saveScheduleConfigSource } = require('./scheduleConfigWriter');
const { formatScheduleConfigErrorForDialog } = require('./scheduleConfigErrorPresenter');
const { openConfigFolderThenExit } = require('./scheduleConfigFolderOpener');
const registerUpdateIpc = require('./ipc/registerUpdateIpc');
const registerShutdownIpc = require('./ipc/registerShutdownIpc');
const registerSettingsIpc = require('./ipc/registerSettingsIpc');
const registerWindowIpc = require('./ipc/registerWindowIpc');
const registerApplicationIpc = require('./ipc/registerApplicationIpc');
const registerScheduleConfigIpc = require('./ipc/registerScheduleConfigIpc');
const registerDiagnosticsIpc = require('./ipc/registerDiagnosticsIpc');
const registerOobeIpc = require('./ipc/registerOobeIpc');

/**
 * IPC 通信管理模块，负责装配各业务域注册器。
 */
class IpcManager {
    /**
     * 构造 IPC 管理器并立即注册所有通道。
     * @param {Object} configManager 配置管理器
     * @param {Object} logger 日志记录器
     * @param {Object} windowManager 窗口管理器
     * @param {Object} trayManager 托盘管理器
     * @param {Object} shutdownScheduler 关机调度器
     * @param {Object} autoLaunchManager 开机自启动管理器
     * @param {Object} updateManager 在线更新管理器
     */
    constructor(configManager, logger, windowManager, trayManager, shutdownScheduler, autoLaunchManager, updateManager) {
        this.configManager = configManager;
        this.logger = logger;
        this.windowManager = windowManager;
        this.trayManager = trayManager;
        this.shutdownScheduler = shutdownScheduler;
        this.autoLaunchManager = autoLaunchManager;
        this.updateManager = updateManager;

        this.setupIpcEvents();
        this.setupOobeEvents();
    }

    /**
     * 记录 IPC 模块日志。
     * @param {string} level 日志级别
     * @param {string} message 日志内容
     */
    log(level, message) {
        this.logger?.[level]?.(message);
    }

    /**
     * 按现有业务顺序注册常规 IPC 通道。
     */
    setupIpcEvents() {
        const log = (level, message) => this.log(level, message);

        registerShutdownIpc({
            ipcMain,
            configManager: this.configManager,
            shutdownScheduler: this.shutdownScheduler,
            log
        });
        registerSettingsIpc({
            ipcMain,
            configManager: this.configManager,
            windowManager: this.windowManager,
            trayManager: this.trayManager,
            shutdownScheduler: this.shutdownScheduler,
            autoLaunchManager: this.autoLaunchManager
        });
        registerWindowIpc({ ipcMain, windowManager: this.windowManager, screen, log });
        registerApplicationIpc({
            ipcMain,
            configManager: this.configManager,
            windowManager: this.windowManager,
            app,
            dialog,
            shell,
            BrowserWindow,
            prompt,
            path,
            log
        });
        registerScheduleConfigIpc({
            ipcMain,
            windowManager: this.windowManager,
            logger: this.logger,
            app,
            dialog,
            shell,
            fs,
            ScheduleConfigExtractor,
            ScheduleConfigLoader,
            saveScheduleConfigSource,
            formatScheduleConfigErrorForDialog,
            openConfigFolderThenExit,
            log
        });
        registerDiagnosticsIpc({ ipcMain, app, shell, dialog, fs, path, log });
        registerUpdateIpc({ ipcMain, updateManager: this.updateManager });
    }

    /**
     * 注册首次运行引导相关 IPC 通道。
     */
    setupOobeEvents() {
        registerOobeIpc({
            ipcMain,
            configManager: this.configManager,
            windowManager: this.windowManager,
            logger: this.logger,
            app,
            shell,
            ScheduleConfigExtractor,
            log: (level, message) => this.log(level, message)
        });
    }
}

module.exports = IpcManager;
