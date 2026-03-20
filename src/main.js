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

// 导入 Electron 模块
const { app, BrowserWindow, Menu, ipcMain, dialog, protocol } = require('electron');
const path = require('path');

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

    // 如果是关键错误，可以选择退出应用
    // app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = `[Unhandled Rejection] ${reason instanceof Error ? reason.message : reason}\nStack: ${reason instanceof Error ? reason.stack : ''}`;
    console.error(errorMsg);
    if (logger) {
        logger.error(errorMsg);
    }
});
const { DisableMinimize } = require('electron-disable-minimize');
const { net } = require('electron');

// 全局变量
let win = undefined;
let tray = undefined;
let testGUIWindow = undefined;
let loadingDialog = undefined;
let appInitialized = false; // 标记应用是否已初始化
let pendingAssignments = null; // 缓存待显示的作业数据
let assignmentCheckInterval = null; // 作业显示检查定时器

// 初始化模块
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
        ipcManager = new IpcManager(configManager, assignmentConfigManager, logger, windowManager, trayManager, shutdownScheduler, autoLaunchManager, clientManager, assignmentWindowManager);

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
if (!app.requestSingleInstanceLock({ key: '电子课表' })) {
    app.quit();
}

/**
 * 注册自定义配置协议
 * 允许通过 config:// 协议访问课表配置文件
 */
function registerConfigProtocol() {
    protocol.handle('config', (request) => {
        const url = request.url.substr(8);
        const configDir = scheduleConfigExtractor.getConfigDir();
        const filePath = path.join(configDir, url);

        return net.fetch(`file://${filePath}`);
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
 * 显示OOBE引导窗口
 * 首次启动时显示,引导用户完成初始配置
 */
function showOobe() {
    if (logger) {
        logger.info('[OOBE] 显示OOBE引导窗口');
    }
    windowManager.createOobeWindow();
}

/**
 * OOBE完成回调
 * 当用户完成OOBE所有步骤后调用
 * 注意：OOBE状态和窗口已在ipcManager中处理,此处只负责初始化主应用
 */
function onOobeComplete() {
    if (logger) {
        logger.info('[OOBE] OOBE完成回调触发,开始启动主应用');
    }

    // 初始化主应用（OOBE状态和窗口已由ipcManager处理）
    initializeApp();
}

/**
 * 显示加载对话框
 * 在应用初始化期间显示加载状态
 */
function showLoadingDialog() {
    loadingDialog = new BrowserWindow({
        width: 600,
        height: 400,
        frame: false,
        alwaysOnTop: true,
        modal: true,
        parent: win,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    loadingDialog.loadFile(path.join(__dirname, 'loading.html'));
}

/**
 * 检查并显示作业窗口
 * 根据配置的显示条件判断是否应该显示作业窗口
 */
function checkAndShowAssignmentWindow() {
    if (!assignmentWindowManager || !assignmentConfigManager) {
        return;
    }

    const displayPeriod = assignmentConfigManager.getAssignmentDisplayPeriod();

    // 检查是否满足显示条件
    if (typeof displayPeriod === 'string' && displayPeriod.startsWith('time:')) {
        const timeStr = displayPeriod.replace('time:', '');
        const [targetHour, targetMinute] = timeStr.split(':').map(Number);
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // 如果当前时间已超过目标时间,且有缓存的作业
        if ((currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute))
            && pendingAssignments) {
            logger.info(`满足显示条件 (${timeStr}),显示作业窗口`);
            assignmentWindowManager.showWindow(pendingAssignments);
            pendingAssignments = null;
        }
    } else if (displayPeriod === -1 && pendingAssignments) {
        // 放学后显示模式,暂时缓存作业
        logger.info('放学后显示模式,作业已缓存');
    }
}

/**
 * 启动作业窗口显示检查定时器
 */
function startAssignmentCheckTimer() {
    if (assignmentCheckInterval) {
        clearInterval(assignmentCheckInterval);
    }

    // 每分钟检查一次
    assignmentCheckInterval = setInterval(checkAndShowAssignmentWindow, 60000);

    // 立即执行一次检查
    checkAndShowAssignmentWindow();

    if (logger) {
        logger.info('作业窗口显示检查定时器已启动');
    }
}

/**
 * 设置 clientManager 的事件回调
 */
function setupClientManagerCallbacks() {
    if (!clientManager || !assignmentWindowManager || !ipcManager) {
        if (logger) {
            logger.warn('无法设置 clientManager 回调：模块未初始化');
        }
        return;
    }

    // 设置新作业回调
    clientManager.setOnNewAssignment((data) => {
        logger.info('收到新作业通知: ' + JSON.stringify(data));
        // 获取作业列表
        const clientId = assignmentConfigManager.getClientId();
        if (clientId) {
            clientManager.getAssignments(clientId).then(assignments => {
                // 缓存作业数据
                pendingAssignments = assignments;
                // 检查是否应该立即显示
                if (assignmentWindowManager.shouldShowWindow()) {
                    assignmentWindowManager.showWindow(assignments);
                    pendingAssignments = null;
                } else {
                    logger.info('作业已缓存,等待满足显示条件');
                }
            }).catch(err => {
                logger.error('获取作业列表失败: ' + err.message);
            });
        }
        // 显示系统通知
        if (clientManager && clientManager.showNotification) {
            clientManager.showNotification('新作业', `收到新作业: ${data.title || '点击查看详情'}`);
        }
    });

    // 设置作业取消回调
    clientManager.setOnAssignmentCancelled((data) => {
        logger.info('收到作业取消通知: ' + JSON.stringify(data));
        // 重新获取作业列表并更新窗口
        const clientId = assignmentConfigManager.getClientId();
        if (clientId) {
            clientManager.getAssignments(clientId).then(assignments => {
                // 更新缓存
                pendingAssignments = assignments;
                // 如果窗口已显示,直接更新
                if (assignmentWindowManager.isWindowVisible()) {
                    assignmentWindowManager.updateAssignments(assignments);
                }
            }).catch(err => {
                logger.error('获取作业列表失败: ' + err.message);
            });
        }
    });

    // 设置WebSocket状态回调
    clientManager.setOnWsStatus((status) => {
        ipcManager.sendWsStatusToRenderer(status);
    });

    // 启动定时检查
    startAssignmentCheckTimer();

    if (logger) {
        logger.info('clientManager 事件回调设置完成');
    }
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
        } else {
            console.warn('应用已经初始化,跳过重复初始化');
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
    } else {
        console.log('开始初始化应用');
    }

    // 创建主窗口
    win = windowManager.createMainWindow();
    Menu.setApplicationMenu(null);

    win.webContents.on('did-finish-load', () => {
        win.webContents.send('getWeekIndex');
    });

    const handle = win.getNativeWindowHandle();
    DisableMinimize(handle);

    // 设置自启动
    autoLaunchManager.setAutoLaunch();

    // 初始化关机调度
    shutdownScheduler.initialize();

    // 创建托盘（只创建一次）
    const iconPath = utils.getAssetPath('image', 'icon.png');
    tray = trayManager.createTray(iconPath);

    // 设置 clientManager 的事件回调
    setupClientManagerCallbacks();

    // 如果作业功能已启用且有clientId,自动连接WebSocket
    if (assignmentConfigManager.getAssignmentEnabled() && assignmentConfigManager.getClientId()) {
        clientManager.connect();
        logger.info('作业功能已启用,自动连接WebSocket');
    }

    if (logger) {
        logger.info('应用初始化完成');
    } else {
        console.log('应用初始化完成');
    }
}

/**
 * 应用启动的主要逻辑入口
 */
app.whenReady().then(async () => {
    console.log('应用准备就绪,开始初始化...');

    // 确保应用完全准备好后再初始化模块
    initializeModules();

    // 注册自定义协议
    registerConfigProtocol();

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
    }

    // 检查OOBE是否已完成
    const isOobeCompleted = configManager.getOobeCompleted();

    if (!isOobeCompleted) {
        // 首次启动,显示OOBE
        if (logger) {
            logger.info('[启动] 首次启动,显示OOBE引导');
        }
        showOobe();
    } else {
        // 非首次启动,显示加载对话框后初始化
        showLoadingDialog();

        // 使用 Promise 确保初始化流程的顺序
        new Promise(resolve => setTimeout(resolve, 1000))
            .then(() => {
                try {
                    initializeApp();
                    try {
                        if (loadingDialog && !loadingDialog.isDestroyed()) {
                            loadingDialog.close();
                        }
                    } catch (closeError) {
                        console.error('关闭加载窗口失败:', closeError);
                        if (logger) logger.warn(`关闭加载窗口失败: ${closeError.message}`);
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
            });
    }
});

/**
 * 监听 OOBE 完成事件
 */
ipcMain.on('oobe-finished', () => {
    onOobeComplete();
});

/**
 * IPC事件处理：打开React GUI窗口
 */
ipcMain.on('openReactGUI', () => {
    if (windowManager) {
        windowManager.createReactGUIWindow();
    }
});

/**
 * 处理来自渲染进程的关机相关操作指令
 */
ipcMain.on('shutdown-action', (action) => {
    // 从全局导出的对象中获取调度器实例
    if (typeof shutdownScheduler === 'undefined' || !shutdownScheduler) {
        console.error('Shutdown scheduler not available');
        return;
    }

    let actionExecuted = false;

    // 根据存储在调度器中的回调函数执行对应操作
    switch (action) {
        case 'delay30':
            if (shutdownScheduler.currentCallbacks && typeof shutdownScheduler.currentCallbacks.onDelay30 === 'function') {
                shutdownScheduler.currentCallbacks.onDelay30();
                actionExecuted = true;
            }
            break;
        case 'delay60':
            if (shutdownScheduler.currentCallbacks && typeof shutdownScheduler.currentCallbacks.onDelay60 === 'function') {
                shutdownScheduler.currentCallbacks.onDelay60();
                actionExecuted = true;
            }
            break;
        case 'close':
            if (shutdownScheduler.currentCallbacks && typeof shutdownScheduler.currentCallbacks.onClose === 'function') {
                shutdownScheduler.currentCallbacks.onClose();
                actionExecuted = true;
            }
            break;
        default:
            if (logger) {
                logger.warn('未知的关机操作:', action);
            } else {
                console.warn('未知的关机操作:', action);
            }
    }

    if (actionExecuted && logger) {
        logger.info(`关机操作已执行: ${action}`);
    }

    // 关闭警告窗口
    if (shutdownScheduler.currentShutdownWarningWindow) {
        shutdownScheduler.currentShutdownWarningWindow.close();
    }
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

    // 清理作业检查定时器
    if (assignmentCheckInterval) {
        clearInterval(assignmentCheckInterval);
        assignmentCheckInterval = null;
    }

    if (testGUIWindow) {
        testGUIWindow.close();
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
    assignmentWindowManager
};

