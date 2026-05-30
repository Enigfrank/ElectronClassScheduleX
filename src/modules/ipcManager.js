const { ipcMain, dialog, BrowserWindow, shell, app, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const prompt = require('electron-prompt');
const ScheduleConfigExtractor = require('./scheduleConfigExtractor');

/**
 * IPC通信管理模块
 * 负责主进程与渲染进程之间的通信管理
 */
class IpcManager {
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

    log(level, message) {
        this.logger?.[level]?.(message);
    }

    setupIpcEvents() {
        this.setupShutdownEvents();
        this.setupConfigEvents();
        this.setupWindowEvents();
        this.setupUtilityEvents();
        this.setupClientEvents();
        this.setupAssignmentWindowEvents();
    }

    setupShutdownEvents() {
        ipcMain.handle('getShutdownTimes', () => this.configManager.getShutdownTimes());

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
                width: 650, height: 650, frame: true, alwaysOnTop: true, modal: true,
                webPreferences: { nodeIntegration: true, contextIsolation: false }
            });

            this.shutdownManagerWindow.loadFile(path.join(__dirname, '..', 'shutdownManager.html'));
            this.shutdownManagerWindow.on('closed', () => { this.shutdownManagerWindow = null; });

            this.shutdownManagerWindow.webContents.on('did-finish-load', () => {
                this.shutdownManagerWindow.webContents.send('shutdownTimesUpdated', this.configManager.getShutdownTimes());
            });
        });

        ipcMain.on('shutdown-action', (event, action) => {
            if (!this.shutdownScheduler) return this.log('error', '[关机管理] 关机调度器未初始化');

            // 1. 映射操作名称
            const methodMap = { delay30: 'onDelay30', delay60: 'onDelay60', close: 'onClose' };
            const methodName = methodMap[action];

            // 2. 拦截真正的“未知操作”
            if (!methodName) {
                return this.log('warn', `[关机管理] 未知的关机操作指令: ${action}`);
            }

            // 3. 使用可选链安全获取回调函数
            const callback = this.shutdownScheduler.currentCallbacks?.[methodName];

            // 4. 执行并记录准确的日志
            if (typeof callback === 'function') {
                callback();
                this.log('info', `[关机管理] 关机操作已执行: ${action}`);
            } else {
                this.log('warn', `[关机管理] 操作被忽略: ${action}`);
            }
        });
    }

    setupConfigEvents() {
        ipcMain.on('getWeekIndex', () => this.trayManager.updateTrayMenu());

        ipcMain.on('setWeekIndex', (e, index) => {
            this.windowManager.getWindow('main')?.webContents.send('setWeekIndex', index);
        });

        ipcMain.on('setClassCountdown', (e, checked) => {
            this.configManager.set('isDuringClassCountdown', checked);
            this.windowManager.getWindow('main')?.webContents.send('ClassCountdown', checked);
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setWindowAlwaysOnTop', (e, checked) => {
            this.configManager.setWindowAlwaysOnTop(checked);
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) this.windowManager.setWindowAlwaysOnTop(mainWindow, checked);
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setDuringClassHidden', (e, checked) => {
            this.configManager.set('isDuringClassHidden', checked);
            this.windowManager.getWindow('main')?.webContents.send('ClassHidden', checked);
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setAutoLaunch', (e, checked) => {
            this.configManager.setAutoLaunch(checked);
            this.autoLaunchManager.setAutoLaunch();
            this.trayManager.updateTrayMenu();
        });

        ipcMain.on('setScheduleShutdown', (e, checked) => {
            this.configManager.set('scheduleShutdown', checked);
            checked ? this.shutdownScheduler.scheduleShutdown() : this.shutdownScheduler.cancelScheduledShutdown();
            this.trayManager.updateTrayMenu();
        });
    }

    setupWindowEvents() {
        ipcMain.on('openSettingDialog', () => {
            this.log('info', '[IPC管理] 打开设置对话框');
            this.windowManager.getWindow('main')?.webContents.send('openSettingDialog');
        });

        ipcMain.on('openReactGUI', () => {
            this.log('info', '[IPC管理] 打开React GUI窗口');
            this.windowManager.createReactGUIWindow();
        });

        ipcMain.on('setDayOffset', () => {
            this.log('info', '[IPC管理] 设置日期偏移');
            this.windowManager.getWindow('main')?.webContents.send('setDayOffset');
        });

        ipcMain.on('openDevTools', () => {
            this.log('info', '[IPC管理] 打开开发者工具');
            const mainWindow = this.windowManager.getWindow('main');
            if (!mainWindow) return;
            this.windowManager.windowExists('devTools') ? this.windowManager.closeDevToolsWindow() : this.windowManager.createDevToolsWindow(mainWindow);
        });

        ipcMain.on('setIgnore', (e, arg) => {
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) mainWindow.setIgnoreMouseEvents(arg, arg ? { forward: true } : undefined);
        });

        let interactiveRect = null;
        let checkTimer = null;
        let isDragging = false;

        const checkMousePosition = () => {
            if (isDragging) return;
            const mainWindow = this.windowManager.getWindow('main');
            if (!mainWindow || mainWindow.isDestroyed()) {
                if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
                return;
            }

            try {
                const point = screen.getCursorScreenPoint();
                const bounds = mainWindow.getBounds();

                if (interactiveRect) {
                    const absoluteRect = {
                        x: bounds.x + interactiveRect.x,
                        y: bounds.y + interactiveRect.y,
                        width: interactiveRect.width,
                        height: interactiveRect.height
                    };

                    const padding = 5;
                    const inArea = point.x >= absoluteRect.x - padding && point.x <= absoluteRect.x + absoluteRect.width + padding &&
                                   point.y >= absoluteRect.y - padding && point.y <= absoluteRect.y + absoluteRect.height + padding;
                    
                    mainWindow.setIgnoreMouseEvents(!inArea, inArea ? undefined : { forward: true });
                }
            } catch (error) {
                this.log('warn', `[IPC管理] 鼠标位置检测异常: ${error.message}`);
            }
        };

        ipcMain.on('updateInteractiveRect', (event, rect) => {
            interactiveRect = rect;
            if (rect) {
                if (!checkTimer) checkTimer = setInterval(checkMousePosition, 25);
            } else {
                if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
                const mainWindow = this.windowManager.getWindow('main');
                if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIgnoreMouseEvents(true, { forward: true });
            }
        });

        ipcMain.on('setDragState', (event, state) => {
            isDragging = state;
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (isDragging) mainWindow.setIgnoreMouseEvents(false);
                else checkMousePosition();
            }
        });
    }

    setupUtilityEvents() {
        ipcMain.on('resetSettings', () => {
            this.log('info', '[IPC管理] 重置设置');
            dialog.showMessageBox({
                title: '重置设置', message: '请选择重置内容', buttons: ['恢复初始设置', '其他操作'],
            }).then((data) => {
                if (data.response === 0) {
                    this.log('info', '[IPC管理] 用户选择恢复初始设置');
                    this.configManager.set('isFirstRun', true);
                    app.relaunch(); 
                    app.exit(0);
                } else if (data.response === 1) {
                    this.showAmtlsWindow();
                }
            }).catch((error) => this.log('error', `[IPC管理] 重置设置时出错: ${error.message}`));
        });

        ipcMain.on('showMoreInfo', () => {
            dialog.showMessageBox({
                type: 'info', buttons: ['OK'], title: 'Let us across hell and reach to heaven！',
                message: `当前版本: ${app.getVersion()}\n\n作者: Enigfrank\n项目地址:https://github.com/Enigfrank/ElectronClassScheduleX`,
            });
        });

        ipcMain.on('quitApp', () => {
            const mainWindow = this.windowManager.getWindow('main');
            dialog.showMessageBox(mainWindow, {
                title: '请确认', message: '你确定要退出程序吗?', buttons: ['取消', '确定']
            }).then((data) => {
                if (data.response) app.quit(); 
            });
        });

        ipcMain.on('log', (e, arg) => this.log('info', `[渲染进程] ${arg}`));

        ipcMain.on('dialog', (e, arg) => {
            const mainWindow = this.windowManager.getWindow('main');
            dialog.showMessageBox(mainWindow, arg.options).then((data) => {
                e.reply(arg.reply, { 'arg': arg, 'index': data.response });
            });
        });

        ipcMain.on('getTimeOffset', (e, arg = 0) => this.handleTimeOffsetSetting(e, arg));

        ipcMain.on('open-external-link', (event, url) => {
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
            const configDir = new ScheduleConfigExtractor(this.logger).getConfigDir();
            shell.openPath(configDir).catch((err) => {
                this.log('error', `[IPC管理] 打开配置文件夹失败: ${err.message}`);
                dialog.showErrorBox('打开文件夹失败', `无法打开配置文件夹: ${configDir}\n错误: ${err.message}`);
            });
        });

        ipcMain.handle('get-logs', async () => {
            try {
                const logsDir = app.getPath('logs'); 
                if (!fs.existsSync(logsDir)) return { success: true, logs: ['暂无日志文件'] };

                const files = fs.readdirSync(logsDir).filter(file => file.endsWith('.log'));
                if (files.length === 0) return { success: true, logs: ['暂无日志文件'] };

                const latestLogFile = files.sort().reverse()[0];
                const logContent = fs.readFileSync(path.join(logsDir, latestLogFile), 'utf8');
                return { success: true, logs: logContent.split('\n').filter(line => line.trim()).slice(-100) };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.on('open-logs-folder', () => {
            const logsDir = app.getPath('logs');
            shell.openPath(logsDir).catch((err) => {
                this.log('error', `[IPC管理] 打开日志文件夹失败: ${err.message}`);
                dialog.showErrorBox('打开文件夹失败', `无法打开日志文件夹: ${logsDir}\n错误: ${err.message}`);
            });
        });
    }

    setupClientManagerCallbacks() {
        if (!this.clientManager) return;
        this.clientManager.setOnWsStatus((status) => this.sendWsStatusToRenderer(status));
        this.log('info', '[IPC管理] 客户端管理器回调设置完成');
    }

    sendWsStatusToRenderer(status) {
        const mainWindow = this.windowManager.getWindow('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('ws-status', status);
        }
    }

    setupClientEvents() {
        ipcMain.handle('getAssignmentConfig', async () => {
            try {
                return { 
                    success: true, 
                    data: {
                        assignmentEnabled: this.assignmentConfigManager.getAssignmentEnabled(),
                        serverURL: this.assignmentConfigManager.getServerURL(),
                        wsURL: this.assignmentConfigManager.getWsURL(),
                        clientId: this.assignmentConfigManager.getClientId(),
                        clientName: this.assignmentConfigManager.getClientName(),
                        assignmentDisplayPeriod: this.assignmentConfigManager.getAssignmentDisplayPeriod()
                    } 
                };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('saveAssignmentConfig', async (event, config) => {
            try {
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
                        const result = await this.clientManager.registerClient({ name: config.clientName });
                        return { success: true, clientId: result.client_id };
                    } else if (savedClientId && config.clientName && config.clientName !== savedClientName) {
                        this.assignmentConfigManager.setClientName(config.clientName);
                    }
                }
                return { success: true, clientId: savedClientId };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('testServerConnection', async (event, serverURL) => {
            if (!this.clientManager) return { success: false, error: '客户端管理器未初始化' };
            try {
                return { success: true, data: await this.clientManager.testConnection(serverURL) };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.handle('getWsStatus', () => {
            try {
                return { success: true, status: this.clientManager ? this.clientManager.getWsStatus() : 'disconnected' };
            } catch (error) {
                return { success: false, status: 'disconnected', error: error.message };
            }
        });

        ipcMain.on('setAssignmentEnabled', (event, enabled) => {
            this.assignmentConfigManager.setAssignmentEnabled(enabled);
            if (enabled) {
                this.clientManager?.connect();
            } else {
                this.clientManager?.disconnect();
                this.assignmentWindowManager?.hideWindow();
            }
        });
    }

    setupAssignmentWindowEvents() {
        ipcMain.on('showAssignmentWindow', () => {
            if (this.assignmentWindowManager) {
                this.assignmentWindowManager.showWindow(this.assignmentWindowManager.getCurrentAssignments());
            }
        });

        ipcMain.on('hideAssignmentWindow', () => this.assignmentWindowManager?.hideWindow());

        ipcMain.on('updateAssignments', (event, assignments) => {
            this.assignmentWindowManager?.updateAssignments(assignments);
        });
    }

    handleTimeOffsetSetting(e, arg = 0) {
        const initialOffset = typeof arg === 'number' ? arg : 0;
        const mainWindow = this.windowManager.getWindow('main');

        prompt({
            title: '计时矫正', label: '请设置课表计时与系统时的偏移秒数(整数)', value: initialOffset.toString(),
            inputAttrs: { type: 'number', step: '1', min: '-86400', max: '86400' },
            type: 'input', height: 200, width: 400, buttons: ['取消', '确认'], defaultId: 1
        }).then((userInput) => {
            if (userInput === null) return;

            const offsetStr = userInput.trim();
            const offset = Number(offsetStr);
            
            if (offsetStr === '' || isNaN(offset)) {
                dialog.showMessageBox(mainWindow, { type: 'error', title: '输入无效', message: '请输入有效的数字格式' });
                return;
            }

            mainWindow?.webContents.send('setTimeOffset', offset);
            dialog.showMessageBox(mainWindow, { type: 'info', title: '设置成功', message: `计时偏移已更新为 ${offset} 秒` });
        }).catch((err) => {
            this.log('error', `[时间偏移设置] 对话框异常: ${err.stack}`);
        });
    }

    showAmtlsWindow() {
        this.amtlsWindow = new BrowserWindow({
            width: 800, height: 680, frame: false, alwaysOnTop: true, modal: true,
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        this.amtlsWindow.loadFile(path.join(__dirname, '..', 'amtls.html'));
        setTimeout(() => this.amtlsWindow?.close(), 5000);
        this.amtlsWindow.on('closed', () => { this.amtlsWindow = null; });
    }

    setupOobeEvents() {
        ipcMain.on('oobe-complete', () => {
            try {
                this.configManager.setOobeCompleted(true);
                this.logger?.flush?.();
                app.relaunch();
                app.exit(0);
            } catch (error) {
                this.log('error', `[IPC管理] OOBE完成处理出错: ${error.message}`);
                this.windowManager.closeOobeWindow();
                setImmediate(() => ipcMain.emit('oobe-finished'));
            }
        });

        ipcMain.on('oobe-open-config-folder', () => {
            const configDir = new ScheduleConfigExtractor(this.logger).getConfigDir();
            shell.openPath(configDir).catch((err) => {
                this.log('error', `[IPC管理] 打开配置文件夹失败: ${err.message}`);
            });
        });

        ipcMain.handle('oobe-save-assignment-config', async (event, config) => {
            try {
                this.assignmentConfigManager.setAssignmentEnabled(config.enabled || false);
                if (config.serverUrl) {
                    this.assignmentConfigManager.setServerURL(config.serverUrl);
                    this.assignmentConfigManager.setWsURL(config.serverUrl.replace(/^http/, 'ws'));
                }
                if (config.clientName) this.assignmentConfigManager.setClientName(config.clientName);

                if (config.enabled && config.clientName && this.clientManager) {
                    try {
                        const result = await this.clientManager.registerClient({ name: config.clientName });
                        return { success: true, clientId: result.client_id };
                    } catch (registerError) {
                        return { success: true, warning: `注册失败: ${registerError.message}` };
                    }
                }
                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        ipcMain.on('open-oobe', () => this.windowManager.createOobeWindow());
        this.log('info', '[IPC管理] OOBE事件监听器设置完成');
    }
}

module.exports = IpcManager;