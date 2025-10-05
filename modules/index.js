// 模块索引文件 - 统一导出所有模块

const Logger = require('./logger');
const ConfigManager = require('./configManager');
const WindowManager = require('./windowManager');
const TrayManager = require('./trayManager');
const ShutdownScheduler = require('./shutdownScheduler');
const AutoLaunchManager = require('./autoLaunchManager');
const Utils = require('./utils');
const IpcManager = require('./ipcManager');

module.exports = {
    Logger,
    ConfigManager,
    WindowManager,
    TrayManager,
    ShutdownScheduler,
    AutoLaunchManager,
    Utils,
    IpcManager
};