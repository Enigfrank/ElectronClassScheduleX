const { ipcMain, dialog, BrowserWindow, Tray } = require('electron');
const path = require('path');
const prompt = require('electron-prompt');

class IpcManager {
    constructor(configManager, logger, windowManager, trayManager, shutdownScheduler, autoLaunchManager) {
        this.configManager = configManager;
        this.logger = logger;
        this.windowManager = windowManager;
        this.trayManager = trayManager;
        this.shutdownScheduler = shutdownScheduler;
        this.autoLaunchManager = autoLaunchManager;
        
        this.shutdownManagerWindow = null;
        this.amtlsWindow = null;
        
        this.setupIpcEvents();
    }

    setupIpcEvents() {
        // 关机相关事件
        this.setupShutdownEvents();
        
        // 配置相关事件
        this.setupConfigEvents();
        
        // 窗口相关事件
        this.setupWindowEvents();
        
        // 工具相关事件
        this.setupUtilityEvents();
    }

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
                this.shutdownManagerWindow.focus();
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

            this.shutdownManagerWindow.loadFile('shutdownManager.html');
            this.shutdownManagerWindow.on('closed', () => {
                this.shutdownManagerWindow = null;
            });
            
            this.shutdownManagerWindow.webContents.on('did-finish-load', () => {
                const times = this.configManager.getShutdownTimes();
                this.shutdownManagerWindow.webContents.send('shutdownTimesUpdated', times);
            });
        });
    }

    setupConfigEvents() {
        ipcMain.on('getWeekIndex', () => {
            // 只更新托盘菜单，不再创建新的托盘图标
            // 托盘图标已经在主程序初始化时创建
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

    setupWindowEvents() {
        ipcMain.on('openSettingDialog', () => {
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                mainWindow.webContents.send('openSettingDialog');
            }
        });

        ipcMain.on('openReactGUI', () => {
            this.windowManager.createReactGUIWindow();
        });

        ipcMain.on('setDayOffset', () => {
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                mainWindow.webContents.send('setDayOffset');
            }
        });

        ipcMain.on('openDevTools', () => {
            const mainWindow = this.windowManager.getWindow('main');
            if (mainWindow) {
                if (mainWindow.webContents.isDevToolsOpened()) {
                    mainWindow.webContents.closeDevTools();
                } else {
                    mainWindow.webContents.openDevTools();
                }
            }
        });

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
    }

    setupUtilityEvents() {
        ipcMain.on('resetSettings', () => {
            dialog.showMessageBox({
                title: '重置设置',
                message: '请选择重置内容',
                buttons: ['恢复初始设置', '其他操作'],
            }).then((data) => {
                if (data.response === 0) {
                    this.configManager.set('isFirstRun', true);
                    const { app } = require('electron');
                    app.relaunch();
                    app.exit(0);
                } else if (data.response === 1) {
                    this.showAmtlsWindow();
                }
            }).catch((error) => {
                this.logger.error('重置设置时出错:', error);
            });
        });

        ipcMain.on('showMoreInfo', () => {
            dialog.showMessageBox({
                type: 'info',
                buttons: ['OK'],
                title: 'Let us across hell and reach to heaven！',
                message: '当前版本: 1.3.2 ' + '\n' + '\n' + '作者: Enigfrank' + '\n' + '项目地址:https://github.com/Enigfrank/ElectronClassScheduleX',
            });
        });

        ipcMain.on('quitApp', () => {
            const mainWindow = this.windowManager.getWindow('main');
            dialog.showMessageBox(mainWindow, {
                title: '请确认',
                message: '你确定要退出程序吗?',
                buttons: ['取消', '确定']
            }).then((data) => {
                if (data.response) {
                    const { app } = require('electron');
                    app.quit();
                }
            });
        });

        ipcMain.on('log', (e, arg) => {
            this.logger.info(arg);
        });

        ipcMain.on('dialog', (e, arg) => {
            const mainWindow = this.windowManager.getWindow('main');
            dialog.showMessageBox(mainWindow, arg.options).then((data) => {
                e.reply(arg.reply, { 'arg': arg, 'index': data.response });
            });
        });

        ipcMain.on('pop', (e, arg) => {
            // 托盘弹出菜单
            // 需要根据具体实现调整
        });

        ipcMain.on('getTimeOffset', (e, arg = 0) => {
            this.handleTimeOffsetSetting(e, arg);
        });
    }

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
                this.logger.info('[时间偏移设置] 用户取消操作');
                dialog.showMessageBox(mainWindow, {
                    type: 'warning',
                    title: '操作取消',
                    message: '您已取消计时偏移设置'
                });
                return;
            }

            const offsetStr = userInput.trim();
            if (offsetStr === '') {
                dialog.showMessageBox(mainWindow, {
                    type: 'error',
                    title: '输入无效',
                    message: '偏移秒数不能为空，请输入有效数字'
                });
                return;
            }

            const offset = Number(offsetStr);
            if (isNaN(offset)) {
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
            
            this.logger.info(`[时间偏移设置] 成功设置偏移量：${offset} 秒`);
            dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: '设置成功',
                message: `计时偏移已更新为 ${offset} 秒`
            });

        }).catch((err) => {
            this.logger.error('[时间偏移设置] 对话框异常:', err.stack);
            dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: '系统错误',
                message: '设置过程中发生异常，请联系管理员'
            });
        });
    }

    showAmtlsWindow() {
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

        this.amtlsWindow.loadFile('amtls.html');

        setTimeout(() => {
            if (this.amtlsWindow && !this.amtlsWindow.isDestroyed()) {
                this.amtlsWindow.close();
            }
        }, 5000);

        this.amtlsWindow.on('closed', () => {
            this.amtlsWindow = null;
        });
    }

    getAssetPath(...paths) {
        return path.join(process.cwd(), ...paths);
    }
}

module.exports = IpcManager;