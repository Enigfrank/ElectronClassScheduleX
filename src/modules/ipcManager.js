const { ipcMain, dialog, BrowserWindow, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const prompt = require('electron-prompt');
const ScheduleConfigExtractor = require('./scheduleConfigExtractor');

/**
 * IPC通信管理模块
 * 负责主进程与渲染进程之间的通信管理
 */
class IpcManager {
    /**
     * 构造函数
     * @param {ConfigManager} configManager - 配置管理器实例
     * @param {AssignmentConfigManager} assignmentConfigManager - 作业配置管理器实例
     * @param {Logger} logger - 日志记录器实例
     * @param {WindowManager} windowManager - 窗口管理器实例
     * @param {TrayManager} trayManager - 托盘管理器实例
     * @param {ShutdownScheduler} shutdownScheduler - 关机调度器实例
     * @param {AutoLaunchManager} autoLaunchManager - 自启动管理器实例
     * @param {ClientManager} clientManager - 客户端管理器实例
     * @param {AssignmentWindowManager} assignmentWindowManager - 作业窗口管理器实例
     */
    constructor(configManager, assignmentConfigManager, logger, windowManager, trayManager, shutdownScheduler, autoLaunchManager, clientManager = null, assignmentWindowManager = null) {
        this.configManager = configManager;
        this.assignmentConfigManager = assignmentConfigManager;
        this.logger = logger;
        this.windowManager = windowManager;
        this.trayManager = trayManager;
        this.shutdownScheduler = shutdownScheduler;
        this.autoLaunchManager = autoLaunchManager;
        this.clientManager = clientManager;
        this.assignmentWindowManager = assignmentWindowManager;

        this.shutdownManagerWindow = null;
        this.amtlsWindow = null;

        this.setupClientManagerCallbacks();
        this.setupIpcEvents();
        this.setupOobeEvents();
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
     * 设置所有IPC事件监听器
     */
    setupIpcEvents() {
        this.setupShutdownEvents();
        this.setupConfigEvents();
        this.setupWindowEvents();
        this.setupUtilityEvents();
        this.setupClientEvents();
        this.setupAssignmentWindowEvents();
    }

    /**
     * 设置关机相关IPC事件监听器
     */
    setupShutdownEvents() {
        ipcMain.handle('getShutdownTimes', () => {
            return this.configManager.getShutdownTimes();
        });

        ipcMain.on('addShutdownTime', (event, timeItem) => {
            const times = this.configManager.getShutdownTimes();
            times.push(timeItem);
            this.configManager.setShutdownTimes(times);
            this.shutdownScheduler.scheduleShutdown();
            event.sender.send('shutdownTimesUpdated', times);
        });

        ipcMain.on('deleteShutdownTime', (event, index) => {
            const times = this.configManager.getShutdownTimes();
            times.splice(index, 1);
            this.configManager.setShutdownTimes(times);
            this.shutdownScheduler.scheduleShutdown();
            event.sender.send('shutdownTimesUpdated', times);
        });

        ipcMain.on('toggleShutdownTime', (event, index) => {
            const times = this.configManager.getShutdownTimes();
            if (times[index]) {
                times[index].enabled = !times[index].enabled;
                this.configManager.setShutdownTimes(times);
                this.shutdownScheduler.scheduleShutdown();
                event.sender.send('shutdownTimesUpdated', times);
            }
        });

        ipcMain.on('openShutdownManager', async (event) => {
            if (this.shutdownManagerWindow) {
                this.shutdownManagerWindow.show();
                return;
            }

            this.shutdownManagerWindow = new BrowserWindow({
                width: 650,
                height: 650,
                frame: true,
                alwaysOnTop: true,
                modal: true,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false
                }
            });

            this.shutdownManagerWindow.loadFile(path.join(__dirname, '..', 'shutdownManager.html'));
            this.shutdownManagerWindow.on('closed', () => {
                this.shutdownManagerWindow = null;
            });

            this.shutdownManagerWindow.webContents.on('did-finish-load', () => {
                const times = this.configManager.getShutdownTimes();
                this.shutdownManagerWindow.webContents.send('shutdownTimesUpdated', times);
            });
        });

        // 处理来自渲染进程的关机相关操作指令
        ipcMain.on('shutdown-action', (event, action) => {
            if (!this.shutdownScheduler) {
                this.log('error', '[关机管理] 关机调度器未初始化');
                return;
            }

            let actionExecuted = false;

            // 根据存储在调度器中的回调函数执行对应操作
            switch (action) {
                case 'delay30':
                    if (this.shutdownScheduler.currentCallbacks && typeof this.shutdownScheduler.currentCallbacks.onDelay30 === 'function') {
                        this.shutdownScheduler.currentCallbacks.onDelay30();
                        actionExecuted = true;
                    }
                    break;
                case 'delay60':
                    if (this.shutdownScheduler.currentCallbacks && typeof this.shutdownScheduler.currentCallbacks.onDelay60 === 'function') {
                        this.shutdownScheduler.currentCallbacks.onDelay60();
                        actionExecuted = true;
                    }
                    break;
                case 'close':
                    if (this.shutdownScheduler.currentCallbacks && typeof this.shutdownScheduler.currentCallbacks.onClose === 'function') {
                        this.shutdownScheduler.currentCallbacks.onClose();
                        actionExecuted = true;
                    }
                    break;
                default:
                    this.log('warn', `[关机管理] 未知的关机操作: ${action}`);
            }

            if (actionExecuted) {
                this.log('info', `[关机管理] 关机操作已执行: ${action}`);
            }

            // 关闭警告窗口
            if (this.shutdownScheduler.currentShutdownWarningWindow) {
                this.shutdownScheduler.currentShutdownWarningWindow.close();
            }
        });
    }

    /**
     * 设置配置相关IPC事件监听器
     */
    setupConfigEvents() {
        ipcMain.on('getWeekIndex', () => {
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setWeekIndex', (e, index) => {
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                mainWindow.webContents.send('setWeekIndex', index);
            }
        });

        ipcMain.on('setClassCountdown', (e, checked) => {
            this.configManager.set('isDuringClassCountdown', checked);
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                mainWindow.webContents.send('ClassCountdown', checked);
            }
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setWindowAlwaysOnTop', (e, checked) => {
            this.configManager.setWindowAlwaysOnTop(checked);
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                this.windowManager.setWindowAlwaysOnTop(mainWindow, checked);
            }
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setDuringClassHidden', (e, checked) => {
            this.configManager.set('isDuringClassHidden', checked);
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                mainWindow.webContents.send('ClassHidden', checked);
            }
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setAutoLaunch', (e, checked) => {
            this.configManager.setAutoLaunch(checked);
            this.autoLaunchManager.setAutoLaunch();
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setScheduleShutdown', (e, checked) => {
            this.configManager.set('scheduleShutdown', checked);
            if (checked) {
                this.shutdownScheduler.scheduleShutdown();
            } else {
                this.shutdownScheduler.cancelScheduledShutdown();
            }
            this.trayManager.updateTrayMenu();
        });
    }

    /**
     * 设置窗口相关IPC事件监听器
     */
    setupWindowEvents() {
        ipcMain.on('openSettingDialog', () => {
            this.log('info', '[IPC管理] 打开设置对话框');
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                mainWindow.webContents.send('openSettingDialog');
            }
        });

        ipcMain.on('openReactGUI', () => {
            this.log('info', '[IPC管理] 打开React GUI窗口');
            this.windowManager.createReactGUIWindow();
        });

        ipcMain.on('setDayOffset', () => {
            this.log('info', '[IPC管理] 设置日期偏移');
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                mainWindow.webContents.send('setDayOffset');
            }
        });

        ipcMain.on('openDevTools', () => {
            this.log('info', '[IPC管理] 打开开发者工具');
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                if (this.windowManager.windowExists('devTools')) {
                    // 如果开发者工具窗口已存在，则关闭它
                    this.windowManager.closeDevToolsWindow();
                } else {
                    // 创建独立的开发者工具窗口
                    this.windowManager.createDevToolsWindow(mainWindow);
                }
            }
        });
        // 设置鼠标穿透
        ipcMain.on('setIgnore', (e, arg) => {
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                if (arg) {
                    mainWindow.setIgnoreMouseEvents(true, { forward: true });
                } else {
                    mainWindow.setIgnoreMouseEvents(false);
                }
            }
        });

        // 交互区域更新
        let interactiveRect = null;
        let checkTimer = null;
        let isDragging = false;
        const { screen } = require('electron');

        const checkMousePosition = () => {
            if (isDragging) return; // 拖动中不进行检查

            const mainWindow = this.windowManager.getWindow('main');
            if (!mainWindow || mainWindow.isDestroyed()) {
                if (checkTimer) {
                    clearInterval(checkTimer);
                    checkTimer = null;
                }
                return;
            }

            try {
                const point = screen.getCursorScreenPoint();
                const bounds = mainWindow.getBounds();
                
                // 计算绝对坐标区域
                // 注意：bounds.x/y 是窗口左上角在屏幕上的坐标
                if (interactiveRect) {
                    const absoluteRect = {
                        x: bounds.x + interactiveRect.x,
                        y: bounds.y + interactiveRect.y,
                        width: interactiveRect.width,
                        height: interactiveRect.height
                    };

                    // 扩大一点判定区域，防止边缘闪烁
                    const padding = 5;
                    if (point.x >= absoluteRect.x - padding && 
                        point.x <= absoluteRect.x + absoluteRect.width + padding &&
                        point.y >= absoluteRect.y - padding && 
                        point.y <= absoluteRect.y + absoluteRect.height + padding) {
                        // 在区域内，禁用穿透
                        mainWindow.setIgnoreMouseEvents(false);
                    } else {
                        // 在区域外，启用穿透
                        mainWindow.setIgnoreMouseEvents(true, { forward: true });
                    }
                }
            } catch (error) {
                // 忽略可能的错误
            }
        };

        ipcMain.on('updateInteractiveRect', (event, rect) => {
            interactiveRect = rect;
            if (rect) {
                if (!checkTimer) {
                    // 启动定时检查，50ms一次
                    checkTimer = setInterval(checkMousePosition, 50);
                }
            } else {
                if (checkTimer) {
                    clearInterval(checkTimer);
                    checkTimer = null;
                    
                    // 确保恢复穿透
                    const mainWindow = this.windowManager.getWindow('main');
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.setIgnoreMouseEvents(true, { forward: true });
                    }
                }
            }
        });

        ipcMain.on('setDragState', (event, state) => {
            isDragging = state;
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (isDragging) {
                    // 拖动开始，强制不穿透
                    mainWindow.setIgnoreMouseEvents(false);
                } else {
                    // 拖动结束，立即检查一次位置
                    checkMousePosition();
                }
            }
        });
    }

    /**
     * 设置工具类IPC事件监听器
     */
    setupUtilityEvents() {
        ipcMain.on('resetSettings', () => {
            this.log('info', '[IPC管理] 重置设置');
            dialog.showMessageBox({
                title: '重置设置',
                message: '请选择重置内容',
                buttons: ['恢复初始设置', '其他操作'],
            }).then((data) => {
                if (data.response === 0) {
                    this.log('info', '[IPC管理] 用户选择恢复初始设置');
                    this.configManager.set('isFirstRun', true);
                    const { app } = require('electron');
                    app.relaunch();
                    app.exit(0);
                } else if (data.response === 1) {
                    this.log('info', '[IPC管理] 用户选择其他操作');
                    this.showAmtlsWindow();
                }
            }).catch((error) => {
                this.log('error', `[IPC管理] 重置设置时出错: ${error.message}`);
            });
        });

        ipcMain.on('showMoreInfo', () => {
            this.log('info', '[IPC管理] 显示更多信息');
            dialog.showMessageBox({
                type: 'info',
                buttons: ['OK'],
                title: 'Let us across hell and reach to heaven！',
                message: '当前版本: ' + app.getVersion() + '\n' + '\n' + '作者: Enigfrank' + '\n' + '项目地址:https://github.com/Enigfrank/ElectronClassScheduleX',
            });
        });

        ipcMain.on('quitApp', () => {
            this.log('info', '[IPC管理] 退出应用请求');
            const mainWindow = this.windowManager.getWindow('main');
            dialog.showMessageBox(mainWindow, {
                title: '请确认',
                message: '你确定要退出程序吗?',
                buttons: ['取消', '确定']
            }).then((data) => {
                if (data.response) {
                    this.log('info', '[IPC管理] 用户确认退出应用');
                    const { app } = require('electron');
                    app.quit();
                }
            });
        });

        ipcMain.on('log', (e, arg) => {
            this.log('info', `[渲染进程] ${arg}`);
        });

        ipcMain.on('dialog', (e, arg) => {
            const mainWindow = this.windowManager.getWindow('main');
            dialog.showMessageBox(mainWindow, arg.options).then((data) => {
                e.reply(arg.reply, { 'arg': arg, 'index': data.response });
            });
        });


        ipcMain.on('getTimeOffset', (e, arg = 0) => {
            this.handleTimeOffsetSetting(e, arg);
        });

        ipcMain.on('open-external-link', (event, url) => {
            this.log('info', `[IPC管理] 打开外部链接: ${url}`);
            if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
                shell.openExternal(url).catch((err) => {
                    this.log('error', `[IPC管理] 打开外部链接失败: ${err.message}`);
                    dialog.showErrorBox('打开链接失败', `无法打开链接: ${url}\n错误: ${err.message}`);
                });
            } else {
                this.log('warn', `[IPC管理] 拒绝打开非法的外部链接: ${url}`);
            }
        });

        ipcMain.on('open-config-folder', () => {
            this.log('info', '[IPC管理] 打开配置文件夹');
            const configExtractor = new ScheduleConfigExtractor(this.logger);
            const configDir = configExtractor.getConfigDir();
            shell.openPath(configDir).catch((err) => {
                this.log('error', `[IPC管理] 打开配置文件夹失败: ${err.message}`);
                dialog.showErrorBox('打开文件夹失败', `无法打开配置文件夹: ${configDir}\n错误: ${err.message}`);
            });
        });



        ipcMain.handle('get-logs', async () => {
            try {
                // 使用与logger模块相同的路径逻辑
                const logsDir = app.getPath('userData') ? path.join(app.getPath('userData'), 'logs') : path.join(__dirname, '..', 'logs');
                
                // 确保日志目录存在
                if (!fs.existsSync(logsDir)) {
                    return { success: true, logs: ['暂无日志文件'] };
                }
                
                const files = fs.readdirSync(logsDir).filter(file => file.endsWith('.log'));

                if (files.length === 0) {
                    return { success: true, logs: ['暂无日志文件'] };
                }

                // 读取最新的日志文件
                const latestLogFile = files.sort().reverse()[0];
                const logPath = path.join(logsDir, latestLogFile);
                const logContent = fs.readFileSync(logPath, 'utf8');

                // 将日志内容按行分割，并限制显示最近100行
                const logLines = logContent.split('\n').filter(line => line.trim()).slice(-100);

                return { success: true, logs: logLines };
            } catch (error) {
                this.log('error', `[IPC管理] 读取日志失败: ${error.message}`);
                return { success: false, error: error.message };
            }
        });

        ipcMain.on('open-logs-folder', () => {
            this.log('info', '[IPC管理] 打开日志文件夹');
            // 使用与logger模块相同的路径逻辑
            const logsDir = app.getPath('userData') ? path.join(app.getPath('userData'), 'logs') : path.join(__dirname, '..', 'logs');
            shell.openPath(logsDir).catch((err) => {
                this.log('error', `[IPC管理] 打开日志文件夹失败: ${err.message}`);
                dialog.showErrorBox('打开文件夹失败', `无法打开日志文件夹: ${logsDir}\n错误: ${err.message}`);
            });
        });

    }

    /**
     * 设置客户端管理器的回调函数
     */
    setupClientManagerCallbacks() {
        if (!this.clientManager) return;

        this.clientManager.setOnWsStatus((status) => {
            this.sendWsStatusToRenderer(status);
        });

        this.log('info', '[IPC管理] 客户端管理器回调设置完成');
    }

    /**
     * 向渲染进程发送WebSocket状态
     * @param {string} status - WebSocket状态
     */
    sendWsStatusToRenderer(status) {
        const mainWindow = this.windowManager.getWindow('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ws-status', status);
            this.log('info', `[IPC管理] 发送WebSocket状态: ${status}`);
        }
    }

    /**
     * 设置客户端相关IPC事件处理
     */
    setupClientEvents() {
        ipcMain.handle('getAssignmentConfig', async () => {
            try {
                const config = {
                    assignmentEnabled: this.assignmentConfigManager.getAssignmentEnabled(),
                    serverURL: this.assignmentConfigManager.getServerURL(),
                    wsURL: this.assignmentConfigManager.getWsURL(),
                    clientId: this.assignmentConfigManager.getClientId(),
                    clientName: this.assignmentConfigManager.getClientName(),
                    assignmentDisplayPeriod: this.assignmentConfigManager.getAssignmentDisplayPeriod()
                };
                this.log('info', '[IPC管理] 获取作业配置');
                return { success: true, data: config };
            } catch (error) {
                this.log('error', `[IPC管理] 获取作业配置失败: ${error.message}`);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('saveAssignmentConfig', async (event, config) => {
            try {
                this.log('info', `[IPC管理] 保存作业配置: ${JSON.stringify(config)}`);

                const savedClientId = this.assignmentConfigManager.getClientId();
                const savedClientName = this.assignmentConfigManager.getClientName();

                this.assignmentConfigManager.setAssignmentEnabled(config.assignmentEnabled || false);
                this.assignmentConfigManager.setServerURL(config.serverURL);
                this.assignmentConfigManager.setWsURL(config.wsURL);
                if (config.assignmentDisplayPeriod !== undefined) {
                    this.assignmentConfigManager.setAssignmentDisplayPeriod(config.assignmentDisplayPeriod);
                }

                if (this.clientManager) {
                    if (config.clientName && !savedClientId) {
                        try {
                            const result = await this.clientManager.registerClient({ name: config.clientName });
                            this.log('info', `[IPC管理] 客户端注册成功: ${result.client_id}`);
                            return { success: true, clientId: result.client_id };
                        } catch (registerError) {
                            this.log('error', `[IPC管理] 客户端注册失败: ${registerError.message}`);
                            return { success: false, error: `注册失败: ${registerError.message}` };
                        }
                    } else if (savedClientId) {
                        if (config.clientName && config.clientName !== savedClientName) {
                            this.assignmentConfigManager.setClientName(config.clientName);
                        }
                    }
                }

                return { success: true, clientId: savedClientId };
            } catch (error) {
                this.log('error', `[IPC管理] 保存作业配置失败: ${error.message}`);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('testServerConnection', async (event, serverURL) => {
            try {
                this.log('info', `[IPC管理] 测试服务器连接: ${serverURL}`);
                if (!this.clientManager) {
                    return { success: false, error: '客户端管理器未初始化' };
                }
                const result = await this.clientManager.testConnection(serverURL);
                return { success: true, data: result };
            } catch (error) {
                this.log('error', `[IPC管理] 测试服务器连接失败: ${error.message}`);
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('getWsStatus', () => {
            try {
                const status = this.clientManager ? this.clientManager.getWsStatus() : 'disconnected';
                this.log('info', `[IPC管理] 获取WebSocket状态: ${status}`);
                return { success: true, status };
            } catch (error) {
                this.log('error', `[IPC管理] 获取WebSocket状态失败: ${error.message}`);
                return { success: false, status: 'disconnected', error: error.message };
            }
        });

        ipcMain.on('setAssignmentEnabled', (event, enabled) => {
            try {
                this.log('info', `[IPC管理] 设置作业功能启用状态: ${enabled}`);
                this.assignmentConfigManager.setAssignmentEnabled(enabled);

                if (enabled) {
                    if (this.clientManager) {
                        this.clientManager.connect();
                    }
                } else {
                    if (this.clientManager) {
                        this.clientManager.disconnect();
                    }
                    if (this.assignmentWindowManager) {
                        this.assignmentWindowManager.hideWindow();
                    }
                }
            } catch (error) {
                this.log('error', `[IPC管理] 设置作业功能启用状态失败: ${error.message}`);
            }
        });
    }

    /**
     * 设置作业窗口相关IPC事件处理
     */
    setupAssignmentWindowEvents() {
        ipcMain.on('showAssignmentWindow', () => {
            try {
                this.log('info', '[IPC管理] 显示作业窗口');
                if (this.assignmentWindowManager) {
                    const assignments = this.assignmentWindowManager.getCurrentAssignments();
                    this.assignmentWindowManager.showWindow(assignments);
                }
            } catch (error) {
                this.log('error', `[IPC管理] 显示作业窗口失败: ${error.message}`);
            }
        });

        ipcMain.on('hideAssignmentWindow', () => {
            try {
                this.log('info', '[IPC管理] 隐藏作业窗口');
                if (this.assignmentWindowManager) {
                    this.assignmentWindowManager.hideWindow();
                }
            } catch (error) {
                this.log('error', `[IPC管理] 隐藏作业窗口失败: ${error.message}`);
            }
        });

        ipcMain.on('updateAssignments', (event, assignments) => {
            try {
                this.log('info', `[IPC管理] 更新作业列表，数量: ${assignments ? assignments.length : 0}`);
                if (this.assignmentWindowManager) {
                    this.assignmentWindowManager.updateAssignments(assignments);
                }
            } catch (error) {
                this.log('error', `[IPC管理] 更新作业列表失败: ${error.message}`);
            }
        });


    }

    /**
     * 处理时间偏移设置对话框
     * @param {Electron.IpcMainEvent} e - IPC事件对象
     * @param {number} arg - 初始偏移值
     */
    handleTimeOffsetSetting(e, arg = 0) {
        const initialOffset = typeof arg === 'number' ? arg : 0;
        const mainWindow = this.windowManager.getWindow('main');

        const dialogConfig = {
            title: '计时矫正',
            label: '请设置课表计时与系统时的偏移秒数(整数)',
            value: initialOffset.toString(),
            inputAttrs: {
                type: 'number',
                step: '1',
                min: '-86400',
                max: '86400'
            },
            type: 'input',
            height: 200,
            width: 400,
            icon: this.getAssetPath('image', 'clock.png'),
            buttons: ['取消', '确认'],
            defaultId: 1
        };

        prompt(dialogConfig).then((userInput) => {
            if (userInput === null) {
                this.log('info', '[时间偏移设置] 用户取消操作');
                dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: '操作取消',
                    message: '您已取消计时偏移设置'
                });
                return;
            }

            const offsetStr = userInput.trim();
            if (offsetStr === '') {
                this.log('warn', '[时间偏移设置] 输入为空');
                dialog.showMessageBox(mainWindow, {
                    type: 'error',
                    title: '输入无效',
                    message: '偏移秒数不能为空，请输入有效数字'
                });
                return;
            }

            const offset = Number(offsetStr);
            if (isNaN(offset)) {
                this.log('warn', '[时间偏移设置] 输入不是有效数字');
                dialog.showMessageBox(mainWindow, {
                    type: 'error',
                    title: '输入无效',
                    message: '请输入有效的数字格式（如：3600 或 -1800）'
                });
                return;
            }

            if (mainWindow) {
                mainWindow.webContents.send('setTimeOffset', offset);
            }

            this.log('info', `[时间偏移设置] 成功设置偏移量: ${offset} 秒`);
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '设置成功',
                message: `计时偏移已更新为 ${offset} 秒`
            });

        }).catch((err) => {
            this.log('error', `[时间偏移设置] 对话框异常: ${err.stack}`);
            dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: '系统错误',
                message: '设置过程中发生异常，请联系管理员'
            });
        });
    }

    /**
     * 显示彩蛋窗口
     */
    showAmtlsWindow() {
        this.log('info', '[IPC管理] 显示彩蛋窗口');
        this.amtlsWindow = new BrowserWindow({
            width: 800,
            height: 680,
            frame: false,
            alwaysOnTop: true,
            modal: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        this.amtlsWindow.loadFile(path.join(__dirname, '..', 'amtls.html'));

        setTimeout(() => {
            if (this.amtlsWindow && !this.amtlsWindow.isDestroyed()) {
                this.amtlsWindow.close();
            }
        }, 5000);

        this.amtlsWindow.on('closed', () => {
            this.amtlsWindow = null;
        });
    }

    /**
     * 获取资源文件路径
     * @param {...string} paths - 路径片段
     * @returns {string} 完整的资源路径
     */
    getAssetPath(...paths) {
        return path.join(process.cwd(), ...paths);
    }

    /**
     * 设置OOBE相关IPC事件处理
     */
    setupOobeEvents() {
        // OOBE完成事件
        ipcMain.on('oobe-complete', () => {
            this.log('info', '[IPC管理] OOBE完成，正在保存配置并重启应用...');
            
            try {
                // 1. 标记OOBE已完成
                this.configManager.setOobeCompleted(true);
                
                // 2. 确保日志已刷新
                if (this.logger && typeof this.logger.flush === 'function') {
                    this.logger.flush();
                }

                // 3. 重启应用
                // 使用 app.relaunch() 准备重启，然后使用 app.exit(0) 退出当前进程
                app.relaunch();
                app.exit(0);
                
            } catch (error) {
                this.log('error', `[IPC管理] OOBE完成处理出错: ${error.message}`);
                // 如果重启失败，尝试回退到原有的初始化逻辑
                this.windowManager.closeOobeWindow();
                setImmediate(() => {
                    ipcMain.emit('oobe-finished');
                });
            }
        });

        // OOBE打开配置文件夹
        ipcMain.on('oobe-open-config-folder', () => {
            this.log('info', '[IPC管理] OOBE中打开配置文件夹');
            const ScheduleConfigExtractor = require('./scheduleConfigExtractor');
            const configExtractor = new ScheduleConfigExtractor(this.logger);
            const configDir = configExtractor.getConfigDir();
            shell.openPath(configDir).catch((err) => {
                this.log('error', `[IPC管理] 打开配置文件夹失败: ${err.message}`);
                dialog.showErrorBox('打开文件夹失败', `无法打开配置文件夹: ${configDir}\n错误: ${err.message}`);
            });
        });

        // OOBE保存作业配置
        ipcMain.handle('oobe-save-assignment-config', async (event, config) => {
            try {
                this.log('info', `[IPC管理] OOBE保存作业配置: ${JSON.stringify(config)}`);

                this.assignmentConfigManager.setAssignmentEnabled(config.enabled || false);
                if (config.serverUrl) {
                    this.assignmentConfigManager.setServerURL(config.serverUrl);
                    this.assignmentConfigManager.setWsURL(config.serverUrl.replace('http', 'ws'));
                }
                if (config.clientName) {
                    this.assignmentConfigManager.setClientName(config.clientName);
                }

                // 如果启用了作业功能且提供了客户端名称，尝试注册
                if (config.enabled && config.clientName && this.clientManager) {
                    try {
                        const result = await this.clientManager.registerClient({ name: config.clientName });
                        this.log('info', `[IPC管理] OOBE中客户端注册成功: ${result.client_id}`);
                        return { success: true, clientId: result.client_id };
                    } catch (registerError) {
                        this.log('error', `[IPC管理] OOBE中客户端注册失败: ${registerError.message}`);
                        // 即使注册失败也返回成功，因为配置已保存
                        return { success: true, warning: `注册失败: ${registerError.message}` };
                    }
                }

                return { success: true };
            } catch (error) {
                this.log('error', `[IPC管理] OOBE保存作业配置失败: ${error.message}`);
                return { success: false, error: error.message };
            }
        });

        // 从GUI打开OOBE
        ipcMain.on('open-oobe', () => {
            this.log('info', '[IPC管理] 从GUI打开OOBE');
            this.windowManager.createOobeWindow();
        });

        this.log('info', '[IPC管理] OOBE事件监听器设置完成');
    }
}

module.exports = IpcManager;