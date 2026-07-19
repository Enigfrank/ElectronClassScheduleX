/**
 * 注册首次运行引导相关 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, configManager: Object, windowManager: Object, logger: Object, app: Electron.App, shell: Electron.Shell, dialog: Electron.Dialog, ScheduleConfigExtractor: Function, log: Function}} dependencies 注册依赖
 */
function registerOobeIpc({
    ipcMain,
    configManager,
    windowManager,
    logger,
    app,
    shell,
    dialog,
    ScheduleConfigExtractor,
    log
}) {
    ipcMain.on('oobe-complete', () => {
        try {
            configManager.setOobeCompleted(true);
            logger?.flush?.();
            app.relaunch();
            app.exit(0);
        } catch (error) {
            log('error', `[IPC管理] OOBE完成处理出错: ${error.message}`);
            windowManager.closeOobeWindow();
            setImmediate(() => ipcMain.emit('oobe-finished'));
        }
    });

    ipcMain.on('oobe-open-config-folder', async () => {
        const configDir = new ScheduleConfigExtractor(logger).getConfigDir();
        try {
            const errorMessage = await shell.openPath(configDir);
            if (!errorMessage) return;
            log('error', `[IPC管理] 打开配置文件夹失败: ${errorMessage}`);
            dialog?.showErrorBox?.('打开文件夹失败', `无法打开配置文件夹: ${configDir}\n错误: ${errorMessage}`);
        } catch (error) {
            log('error', `[IPC管理] 打开配置文件夹失败: ${error.message}`);
            dialog?.showErrorBox?.('打开文件夹失败', `无法打开配置文件夹: ${configDir}\n错误: ${error.message}`);
        }
    });

    ipcMain.on('open-oobe', () => windowManager.createOobeWindow());
    log('info', '[IPC管理] OOBE事件监听器设置完成');
}

module.exports = registerOobeIpc;
