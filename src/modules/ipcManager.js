const { ipcMain, dialog, BrowserWindow, shell, app, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const prompt = require('electron-prompt');
const ScheduleConfigExtractor = require('./scheduleConfigExtractor');
const ScheduleConfigLoader = require('./scheduleConfigLoader');
const { saveScheduleConfigSource } = require('./scheduleConfigWriter');
const { formatScheduleConfigErrorForDialog } = require('./scheduleConfigErrorPresenter');
const { openConfigFolderThenExit } = require('./scheduleConfigFolderOpener');

/**
 * IPC通信管理模块
 * 负责主进程与渲染进程之间的通信管理
 */
class IpcManager {
    constructor(configManager, logger, windowManager, trayManager, shutdownScheduler, autoLaunchManager) {
        this.configManager = configManager;
        this.logger = logger;
        this.windowManager = windowManager;
        this.trayManager = trayManager;
        this.shutdownScheduler = shutdownScheduler;
        this.autoLaunchManager = autoLaunchManager;

        this.amtlsWindow = null;

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

        ipcMain.handle('load-schedule-config', () => {
            const configFilePath = new ScheduleConfigExtractor(this.logger).getConfigFilePath();
            this.log('info', `[课表配置] 加载配置对象: ${configFilePath}`);
            const loader = new ScheduleConfigLoader(configFilePath, this.logger);
            return loader.load();
        });

        ipcMain.handle('read-schedule-config-source', () => {
            const configFilePath = new ScheduleConfigExtractor(this.logger).getConfigFilePath();
            this.log('info', `[课表配置] 读取配置源码: ${configFilePath}`);

            try {
                const source = fs.readFileSync(configFilePath, 'utf8');
                this.log('info', `[课表配置] 读取配置源码成功: ${configFilePath}，长度: ${source.length}`);
                return {
                    success: true,
                    source,
                    filePath: configFilePath
                };
            } catch (error) {
                this.log('error', `[课表配置] 读取配置源码失败: ${configFilePath} - ${error.message}`);
                return {
                    success: false,
                    error: {
                        type: 'read',
                        title: '课表配置读取失败',
                        message: error.message,
                        filePath: configFilePath
                    }
                };
            }
        });

        ipcMain.handle('save-schedule-config-source', (event, source) => {
            const configFilePath = new ScheduleConfigExtractor(this.logger).getConfigFilePath();
            this.log('info', `[课表配置] 收到保存配置源码请求: ${configFilePath}`);
            return saveScheduleConfigSource({
                filePath: configFilePath,
                source,
                logger: this.logger
            });
        });

        ipcMain.handle('apply-schedule-config', () => {
            this.log('info', '[课表配置] 请求应用配置: 准备重建主课表窗口');
            try {
                this.windowManager.reloadMainScheduleWindow();
                this.log('info', '[课表配置] 应用配置成功: 主课表窗口已重建');
                return { success: true };
            } catch (error) {
                this.log('error', `[课表配置] 应用失败: ${error.message}`);
                return {
                    success: false,
                    error: {
                        type: 'apply',
                        title: '课表配置应用失败',
                        message: error.message
                    }
                };
            }
        });

        ipcMain.handle('import-schedule-config-source', async () => {
            this.log('info', '[课表配置] 导入配置源码: 打开文件选择对话框');
            const result = await dialog.showOpenDialog({
                title: '导入课表配置',
                filters: [{ name: 'JavaScript 配置文件', extensions: ['js'] }],
                properties: ['openFile']
            });

            if (result.canceled || result.filePaths.length === 0) {
                this.log('info', '[课表配置] 导入配置源码已取消');
                return { success: false, canceled: true };
            }

            const filePath = result.filePaths[0];
            try {
                const source = fs.readFileSync(filePath, 'utf8');
                this.log('info', `[课表配置] 导入配置源码成功: ${filePath}，长度: ${source.length}`);
                return {
                    success: true,
                    source,
                    filePath
                };
            } catch (error) {
                this.log('error', `[课表配置] 导入配置源码失败: ${filePath} - ${error.message}`);
                return {
                    success: false,
                    error: {
                        type: 'read',
                        title: '导入配置读取失败',
                        message: error.message,
                        filePath
                    }
                };
            }
        });

        ipcMain.handle('export-schedule-config-source', async (event, source) => {
            this.log('info', '[课表配置] 导出配置源码: 打开保存对话框');
            const result = await dialog.showSaveDialog({
                title: '导出课表配置',
                defaultPath: 'scheduleConfig.js',
                filters: [{ name: 'JavaScript 配置文件', extensions: ['js'] }]
            });

            if (result.canceled || !result.filePath) {
                this.log('info', '[课表配置] 导出配置源码已取消');
                return { success: false, canceled: true };
            }

            try {
                fs.writeFileSync(result.filePath, String(source || ''), 'utf8');
                this.log('info', `[课表配置] 导出配置源码成功: ${result.filePath}，长度: ${String(source || '').length}`);
                return { success: true, filePath: result.filePath };
            } catch (error) {
                this.log('error', `[课表配置] 导出配置源码失败: ${result.filePath} - ${error.message}`);
                return {
                    success: false,
                    error: {
                        type: 'write',
                        title: '导出配置失败',
                        message: error.message,
                        filePath: result.filePath
                    }
                };
            }
        });

        ipcMain.on('show-schedule-config-error', async (event, error) => {
            await this.showScheduleConfigErrorAndExit(error);
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

    /**
     * 关闭主课表窗口，显示独立错误提示，并按用户选择打开配置文件夹或退出
     * @param {Object} error - 课表配置加载错误
     */
    async showScheduleConfigErrorAndExit(error) {
        const mainWindow = this.windowManager.getWindow('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.close();
        }

        const dialogData = formatScheduleConfigErrorForDialog(error);
        const result = await dialog.showMessageBox({
            type: 'error',
            title: dialogData.title,
            message: dialogData.message,
            detail: dialogData.detail,
            buttons: ['打开课表文件夹', '退出程序'],
            defaultId: 0,
            cancelId: 1,
            noLink: true
        });

        if (result.response === 0) {
            const configDir = new ScheduleConfigExtractor(this.logger).getConfigDir();
            await openConfigFolderThenExit({
                configDir,
                shell,
                app,
                dialog,
                logger: this.logger
            });
            return;
        }

        app.quit();
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

        ipcMain.on('open-oobe', () => this.windowManager.createOobeWindow());
        this.log('info', '[IPC管理] OOBE事件监听器设置完成');
    }
}

module.exports = IpcManager;
