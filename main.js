// 导入模块
const Logger = require('./modules/logger');
const ConfigManager = require('./modules/configManager');
const WindowManager = require('./modules/windowManager');
const TrayManager = require('./modules/trayManager');
const ShutdownScheduler = require('./modules/shutdownScheduler');
const AutoLaunchManager = require('./modules/autoLaunchManager');
const Utils = require('./modules/utils');
const IpcManager = require('./modules/ipcManager');

// 导入 Electron 模块
const { app, BrowserWindow, Menu, ipcMain, dialog, screen, Tray, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const createShortcut = require('windows-shortcuts');
const prompt = require('electron-prompt');
const { DisableMinimize } = require('electron-disable-minimize');
const { exec } = require('child_process');

// 全局变量
let win = undefined;
let tray = undefined;
let testGUIWindow = undefined;
let loadingDialog = undefined;
let appInitialized = false; // 标记应用是否已初始化

// 初始化模块
let logger;
let configManager;
let utils;
let windowManager;
let trayManager;
let shutdownScheduler;
let autoLaunchManager;
let ipcManager;

// 初始化函数
function initializeModules() {
    try {
        logger = new Logger();
        configManager = new ConfigManager();
        utils = new Utils();
        windowManager = new WindowManager(configManager, logger);
        trayManager = new TrayManager(configManager, logger, windowManager);
        shutdownScheduler = new ShutdownScheduler(configManager, logger);
        autoLaunchManager = new AutoLaunchManager(configManager, logger);
        ipcManager = new IpcManager(configManager, logger, windowManager, trayManager, shutdownScheduler, autoLaunchManager);
        
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

// 欢迎对话框
async function firstopen() {
    return await dialog.showMessageBox({
        type: 'info',
        buttons: ['OK'],
        title: '欢迎使用!',
        message: '欢迎使用电子课表,课程配置请在根目录中的js文件夹中的scheduleConfig.js文件进行修改' + '\n' + '\n' + '祝您使用愉快!(本提示只显示一次)' + '\n' + 'Developer : Enigfrank'
    });
}

// 显示加载对话框
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

// 初始化应用
function initializeApp() {
    // 防止重复初始化
    if (appInitialized) {
        if (logger) {
            logger.warn('应用已经初始化，跳过重复初始化');
        } else {
            console.warn('应用已经初始化，跳过重复初始化');
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
    
    if (logger) {
        logger.info('应用初始化完成');
    } else {
        console.log('应用初始化完成');
    }
}

// 应用启动逻辑
app.whenReady().then(async () => {
    console.log('应用准备就绪，开始初始化...');
    
    // 确保应用完全准备好后再初始化模块
    initializeModules();
    
    // 记录日志系统状态
    if (logger) {
        const logStatus = logger.getStatus();
        logger.info(`日志系统状态: ${JSON.stringify(logStatus)}`);
        logger.info('应用启动完成，开始加载配置...');
    }
    
    const isFirstRun = configManager.getIsFirstRun();
    
    if (isFirstRun) {
        await firstopen();
        configManager.setIsFirstRun(false);
        
        initializeApp();
        
    } else {
        showLoadingDialog();
        setTimeout(() => {
            if (loadingDialog) {
                loadingDialog.close();
            }
            
            initializeApp();
            
        }, 1000);
    }
});

// IPC 事件处理
ipcMain.on('openReactGUI', () => {
    if (windowManager) {
        windowManager.createReactGUIWindow();
    }
});

ipcMain.on('shutdown-action', (event, action) => {
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

// 应用退出前清理
app.on('before-quit', () => {
    if (logger) {
        logger.info('应用正在退出...');
        logger.flush(); // 刷新日志确保所有日志都被写入
        logger.cleanupOldLogs(); // 清理旧日志
    }
    
    if (testGUIWindow) {
        testGUIWindow.close();
        shutdownScheduler.cancelScheduledShutdown();
    }
    
    // 清理托盘
    if (tray) {
        tray.destroy();
    }
});

// 导出模块供其他文件使用
module.exports = {
    logger,
    configManager,
    windowManager,
    trayManager,
    shutdownScheduler,
    autoLaunchManager,
    utils
};

