/**
 * 注册课表配置读取、写入、导入导出与错误处理 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, windowManager: Object, logger: Object, app: Electron.App, dialog: Electron.Dialog, shell: Electron.Shell, fs: Object, ScheduleConfigExtractor: Function, ScheduleConfigLoader: Function, saveScheduleConfigSource: Function, formatScheduleConfigErrorForDialog: Function, openConfigFolderThenExit: Function, log: Function}} dependencies 注册依赖
 */
function registerScheduleConfigIpc({
    ipcMain,
    windowManager,
    logger,
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
}) {
    /**
     * 关闭主课表窗口，显示配置错误并按用户选择打开配置文件夹或退出。
     * @param {Object} error 课表配置加载错误
     */
    async function showScheduleConfigErrorAndExit(error) {
        const mainWindow = windowManager.getWindow('main');
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
            const configDir = new ScheduleConfigExtractor(logger).getConfigDir();
            await openConfigFolderThenExit({ configDir, shell, app, dialog, logger });
            return;
        }

        app.quit();
    }

    ipcMain.on('open-config-folder', () => {
        const configDir = new ScheduleConfigExtractor(logger).getConfigDir();
        shell.openPath(configDir).catch((error) => {
            log('error', `[IPC管理] 打开配置文件夹失败: ${error.message}`);
            dialog.showErrorBox('打开文件夹失败', `无法打开配置文件夹: ${configDir}\n错误: ${error.message}`);
        });
    });

    ipcMain.handle('load-schedule-config', () => {
        const configFilePath = new ScheduleConfigExtractor(logger).getConfigFilePath();
        log('info', `[课表配置] 加载配置对象: ${configFilePath}`);
        const loader = new ScheduleConfigLoader(configFilePath, logger);
        return loader.load();
    });

    ipcMain.handle('read-schedule-config-source', () => {
        const configFilePath = new ScheduleConfigExtractor(logger).getConfigFilePath();
        log('info', `[课表配置] 读取配置源码: ${configFilePath}`);

        try {
            const source = fs.readFileSync(configFilePath, 'utf8');
            log('info', `[课表配置] 读取配置源码成功: ${configFilePath}，长度: ${source.length}`);
            return { success: true, source, filePath: configFilePath };
        } catch (error) {
            log('error', `[课表配置] 读取配置源码失败: ${configFilePath} - ${error.message}`);
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
        const configFilePath = new ScheduleConfigExtractor(logger).getConfigFilePath();
        log('info', `[课表配置] 收到保存配置源码请求: ${configFilePath}`);
        return saveScheduleConfigSource({ filePath: configFilePath, source, logger });
    });

    ipcMain.handle('apply-schedule-config', () => {
        log('info', '[课表配置] 请求应用配置: 准备重建主课表窗口');
        try {
            windowManager.reloadMainScheduleWindow();
            log('info', '[课表配置] 应用配置成功: 主课表窗口已重建');
            return { success: true };
        } catch (error) {
            log('error', `[课表配置] 应用失败: ${error.message}`);
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
        log('info', '[课表配置] 导入配置源码: 打开文件选择对话框');
        const result = await dialog.showOpenDialog({
            title: '导入课表配置',
            filters: [{ name: 'JavaScript 配置文件', extensions: ['js'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
            log('info', '[课表配置] 导入配置源码已取消');
            return { success: false, canceled: true };
        }

        const filePath = result.filePaths[0];
        try {
            const source = fs.readFileSync(filePath, 'utf8');
            log('info', `[课表配置] 导入配置源码成功: ${filePath}，长度: ${source.length}`);
            return { success: true, source, filePath };
        } catch (error) {
            log('error', `[课表配置] 导入配置源码失败: ${filePath} - ${error.message}`);
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
        log('info', '[课表配置] 导出配置源码: 打开保存对话框');
        const result = await dialog.showSaveDialog({
            title: '导出课表配置',
            defaultPath: 'scheduleConfig.js',
            filters: [{ name: 'JavaScript 配置文件', extensions: ['js'] }]
        });

        if (result.canceled || !result.filePath) {
            log('info', '[课表配置] 导出配置源码已取消');
            return { success: false, canceled: true };
        }

        try {
            fs.writeFileSync(result.filePath, String(source || ''), 'utf8');
            log('info', `[课表配置] 导出配置源码成功: ${result.filePath}，长度: ${String(source || '').length}`);
            return { success: true, filePath: result.filePath };
        } catch (error) {
            log('error', `[课表配置] 导出配置源码失败: ${result.filePath} - ${error.message}`);
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
        await showScheduleConfigErrorAndExit(error);
    });
}

module.exports = registerScheduleConfigIpc;
