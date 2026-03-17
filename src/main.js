// 导入模块
const Logger = require('./modules/logger');
const ConfigManager = require('./modules/configManager');
const AssignmentConfigManager = require('./modules/assignmentConfigManager');
const WindowManager = require('./modules/windowManager');
const TrayManager = require('./modules/trayManager');
const ShutdownScheduler = require('./modules/shutdownScheduler');
const AutoLaunchManager = require('./modules/autoLaunchManager');
const Utils = require('./modules/utils');
const IpcManager = require('./modules/ipcManager');
const ScheduleConfigExtractor = require('./modules/scheduleConfigExtractor');
const ClientManager = require('./modules/clientManager');
const AssignmentWindowManager = require('./modules/assignmentWindowManager');
const AssignmentScheduler = require('./modules/assignmentScheduler');
const ProtocolHandler = require('./modules/protocolHandler');
const BootManager = require('./modules/bootManager');
const { app, Menu, ipcMain, dialog } = require('electron');
const { DisableMinimize } = require('electron-disable-minimize');

// 全局异常处理
process.on('uncaughtException', (error) => {
    const errorMsg = `[Uncaught Exception] ${error.message}\nStack: ${error.stack}`;
    console.error(errorMsg);
    if (logger) {
        logger.error(errorMsg);
        // 尝试写入最后的日志
        try {
            logger.flush();
        } catch (e) {
            console.error('Failed to flush logger:', e);
        }
    }
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = `[Unhandled Rejection] ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : ''}`;
    console.error(errorMsg);
    if (logger) {
        logger.error(errorMsg);
    }
});

// 全局变量
let win = undefined;
let tray = undefined;
let appInitialized = false; // 标记应用是否已初始化

// 模块实例
let logger;
let configManager;
let assignmentConfigManager;
let utils;
let windowManager;
let trayManager;
let shutdownScheduler;
let autoLaunchManager;
let ipcManager;
let scheduleConfigExtractor;
let clientManager;
let assignmentWindowManager;

// 新模块实例
let assignmentScheduler;
let protocolHandler;
let bootManager;

/**
 * 初始化所有模块
 * 创建并配置各个功能模块的实例
 */
function initializeModules() {
    try {
        logger = new Logger();
        scheduleConfigExtractor = new ScheduleConfigExtractor(logger);
        configManager = new ConfigManager(logger);
        assignmentConfigManager = new AssignmentConfigManager(logger);
        utils = new Utils(logger);
        windowManager = new WindowManager(configManager, logger);
        trayManager = new TrayManager(configManager, logger, windowManager);
        shutdownScheduler = new ShutdownScheduler(configManager, logger);
        autoLaunchManager = new AutoLaunchManager(configManager, logger);
        clientManager = new ClientManager(assignmentConfigManager, logger);
        assignmentWindowManager = new AssignmentWindowManager(assignmentConfigManager, logger);
        protocolHandler = new ProtocolHandler(scheduleConfigExtractor);
        bootManager = new BootManager(windowManager, configManager, logger);
        ipcManager = new IpcManager(configManager, assignmentConfigManager, logger, windowManager, trayManager, shutdownScheduler, autoLaunchManager, clientManager, assignmentWindowManager);
        assignmentScheduler = new AssignmentScheduler(assignmentConfigManager, assignmentWindowManager, clientManager, ipcManager, logger);

        if (logger) {
            logger.info('所有模块初始化完成');
        }
    } catch (error) {
        console.error('模块初始化失败:', error);
        if (logger) {
            logger.error('模块初始化失败: ' + error.message);
        }
    }
}

// 检查单例锁
const gotTheLock = app.requestSingleInstanceLock({ key: '电子课表' });

if (!gotTheLock) {
    console.error('获取单例锁失败，应用已在运行，即将退出');
    if (logger) {
        logger.warn('获取单例锁失败，应用已在运行，即将退出');
        logger.flush();
    }
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // 当运行第二个实例时，聚焦到主窗口
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
        if (logger) {
            logger.info('检测到第二个实例启动，已聚焦主窗口');
        }
    });
}

/**
 * 确保课表配置文件存在
 * 如果不存在则尝试从资源目录提取
 * @returns {boolean} 是否提取成功
 */
function ensureScheduleConfig() {
    if (!scheduleConfigExtractor) {
        scheduleConfigExtractor = new ScheduleConfigExtractor(logger);
    }
    const result = scheduleConfigExtractor.ensureConfigExists();
    if (!result.success) {
        if (logger) {
            logger.error('配置文件提取失败: ' + result.error);
        }
        return false;
    }
    return true;
}

/**
 * 初始化应用
 * 创建主窗口、设置托盘、初始化各模块
 */
function initializeApp() {
    // 防止重复初始化
    if (appInitialized) {
        if (logger) {
            logger.warn('应用已经初始化,跳过重复初始化');
        }
        return;
    }

    appInitialized = true;

    // 确保模块已初始化
    if (!logger) {
        initializeModules();
    }

    if (logger) {
        logger.info('开始初始化应用');
    }

    // 创建主窗口
    win = windowManager.createMainWindow();
    Menu.setApplicationMenu(null);

    win.webContents.on('did-finish-load', () => {
        win.webContents.send('getWeekIndex');
    });

    const handle = win.getNativeWindowHandle();
    DisableMinimize(handle);

    autoLaunchManager.setAutoLaunch();

    shutdownScheduler.initialize();

    const iconPath = utils.getAssetPath('image', 'icon.png');
    tray = trayManager.createTray(iconPath);

    assignmentScheduler.setupCallbacks();

    if (assignmentConfigManager.getAssignmentEnabled() && assignmentConfigManager.getClientId()) {
        clientManager.connect();
        logger.info('作业功能已启用,自动连接WebSocket');
    }

    if (logger) {
        logger.info('应用初始化完成');
    }
}

/**
 * OOBE完成回调
 * 当用户完成OOBE所有步骤后调用
 */
function onOobeComplete() {
    if (logger) {
        logger.info('[OOBE] OOBE完成回调触发,开始启动主应用');
    }
    initializeApp();
}

/**
 * 检测是否为自启动场景
 * @returns {boolean} 是否为自启动
 */
function isAutoLaunch() {
    // Windows 任务计划程序启动时，命令行参数可能包含特定标识
    // 或者通过进程环境变量判断
    if (process.platform === 'win32') {
        // 检查是否由任务计划程序启动（自启动）
        const isTaskScheduler = process.env.STARTED_BY_TASK_SCHEDULER === '1';
        if (isTaskScheduler) {
            return true;
        }
    }
    return false;
}

/**
 * 应用启动的主要逻辑入口
 */
app.whenReady().then(async () => {
    console.log('应用准备就绪,开始初始化...');

    // 检测自启动场景
    const autoLaunch = isAutoLaunch();
    const isWindows = process.platform === 'win32';

    // 自启动场景下，等待更长时间确保系统环境完全准备好
    const startupDelay = autoLaunch ? 3000 : 0;

    if (autoLaunch) {
        console.log('检测到自启动场景，延迟初始化以确保系统环境准备好...');
    }

    // 等待系统环境完全准备好
    await new Promise(resolve => setTimeout(resolve, startupDelay));

    // 确保应用完全准备好后再初始化模块
    initializeModules();

    // 注册自定义协议
    protocolHandler.register();

    // 确保配置文件存在
    if (!ensureScheduleConfig()) {
        const msg = '配置文件初始化失败，程序无法继续运行。';
        if (logger) logger.error(msg);
        dialog.showErrorBox('启动错误', msg);
        app.quit();
        return;
    }

    // 记录日志系统状态
    if (logger) {
        const logStatus = logger.getStatus();
        logger.info(`日志系统状态: ${JSON.stringify(logStatus)}`);
        logger.info('应用启动完成,开始加载配置...');
        if (autoLaunch) {
            logger.info('[自启动] 自启动场景，已应用额外延迟');
        }
    }

    // 检查OOBE是否已完成
    const isOobeCompleted = configManager.getOobeCompleted();

    if (!isOobeCompleted) {
        // 首次启动,显示OOBE
        if (logger) {
            logger.info('[启动] 首次启动,显示OOBE引导');
        }
        bootManager.showOobe();
    } else {
        // 非首次启动,显示加载对话框后初始化
        bootManager.showLoading();

        // 使用 Promise 确保初始化流程的顺序
        // 自启动场景下使用更长的延迟
        const initializationDelay = autoLaunch ? 2000 : 500;
        setTimeout(() => {
            if (app.isQuitting) return; // 如果应用正在退出，中止初始化
            try {
                initializeApp();

                // 确保主窗口创建成功后，监听 ready-to-show 事件关闭加载窗口
                if (win && !win.isDestroyed()) {
                    let loadingClosed = false;

                    const closeLoading = () => {
                        if (loadingClosed) return;
                        loadingClosed = true;
                        bootManager.closeLoading();
                    };

                    win.once('ready-to-show', () => {
                        closeLoading();
                        win.show(); // 确保主窗口显示
                    });

                    // 设置超时兜底，防止 ready-to-show 不触发导致加载窗口一直显示
                    setTimeout(closeLoading, 5000);
                } else {
                    // 如果主窗口未创建，直接关闭加载窗口
                    bootManager.closeLoading();
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                const msg = `初始化失败: ${errorMsg}`;
                if (logger) {
                    logger.error(msg);
                    if (error.stack) logger.error(error.stack);
                }
                console.error(msg);
                dialog.showErrorBox('启动错误', msg);
                app.quit();
            }
        }, initializationDelay);
    }
});

/**
 * 监听 OOBE 完成事件
 */
ipcMain.on('oobe-finished', () => {
    onOobeComplete();
});

/**
 * 应用退出前清理
 * 清理资源、刷新日志、关闭连接
 */
app.on('before-quit', () => {
    if (logger) {
        logger.info('应用正在退出...');
        logger.flush(); // 刷新日志确保所有日志都被写入
        logger.cleanupOldLogs(); // 清理旧日志
    }

    // 清理 clientManager
    if (clientManager) {
        clientManager.destroy();
    }

    // 清理 assignmentWindowManager
    if (assignmentWindowManager) {
        assignmentWindowManager.hideWindow();
    }

    // 清理作业调度器
    if (assignmentScheduler) {
        assignmentScheduler.stop();
    }

    // 清理关机调度器
    if (shutdownScheduler) {
        shutdownScheduler.cancelScheduledShutdown();
    }

    // 清理托盘
    if (trayManager) {
        trayManager.destroy();
    }
    if (tray) {
        tray.destroy();
        tray = null;
    }
});

/**
 * 所有窗口关闭时的处理
 * 防止在窗口切换过程中（如OOBE -> 主窗口）程序意外退出
 */
app.on('window-all-closed', () => {
    // 保持程序运行，因为可能有托盘或正在切换窗口
    if (logger) {
        logger.info('所有窗口已关闭，保持后台运行');
    }
});

// 导出模块供其他文件使用
module.exports = {
    logger,
    configManager,
    assignmentConfigManager,
    windowManager,
    trayManager,
    shutdownScheduler,
    autoLaunchManager,
    utils,
    scheduleConfigExtractor,
    clientManager,
    assignmentWindowManager,
    assignmentScheduler,
    protocolHandler,
    bootManager
};
