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
const logger = new Logger();
const configManager = new ConfigManager();
const utils = new Utils();
const windowManager = new WindowManager(configManager, logger);
const trayManager = new TrayManager(configManager, logger, windowManager);
const shutdownScheduler = new ShutdownScheduler(configManager, logger);
const autoLaunchManager = new AutoLaunchManager(configManager, logger);
const ipcManager = new IpcManager(configManager, logger, windowManager, trayManager, shutdownScheduler, autoLaunchManager);

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
        logger.warn('应用已经初始化，跳过重复初始化');
        return;
    }
    
    appInitialized = true;
    logger.info('开始初始化应用');
    
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
    
    logger.info('应用初始化完成');
}

// 应用启动逻辑
app.whenReady().then(async () => {
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
ipcMain.on('shutdown-action', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    if (!win || win.isDestroyed()) return;

    // 根据窗口上挂载的回调函数执行对应操作
    switch (action) {
        case 'delay30':
            if (typeof win.onDelay30 === 'function') {
                win.onDelay30();
            }
            break;
        case 'delay60':
            if (typeof win.onDelay60 === 'function') {
                win.onDelay60();
            }
            break;
        case 'close':
            if (typeof win.onClose === 'function') {
                win.onClose();
            }
            break;
        default:
            logger.warn('未知的关机操作:', action);
    }
});

// 应用退出前清理
app.on('before-quit', () => {
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

