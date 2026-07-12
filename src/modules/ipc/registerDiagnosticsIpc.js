/**
 * 注册日志读取与诊断目录相关 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, app: Electron.App, shell: Electron.Shell, dialog: Electron.Dialog, fs: Object, path: Object, log: Function}} dependencies 注册依赖
 */
function registerDiagnosticsIpc({ ipcMain, app, shell, dialog, fs, path, log }) {
    ipcMain.on('log', (event, arg) => log('info', `[渲染进程] ${arg}`));

    ipcMain.handle('get-logs', async () => {
        try {
            const logsDir = app.getPath('logs');
            if (!fs.existsSync(logsDir)) return { success: true, logs: ['暂无日志文件'] };

            const files = fs.readdirSync(logsDir).filter((file) => file.endsWith('.log'));
            if (files.length === 0) return { success: true, logs: ['暂无日志文件'] };

            const latestLogFile = files.sort().reverse()[0];
            const logContent = fs.readFileSync(path.join(logsDir, latestLogFile), 'utf8');
            return { success: true, logs: logContent.split('\n').filter((line) => line.trim()).slice(-100) };
        } catch (error) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('open-logs-folder', () => {
        const logsDir = app.getPath('logs');
        shell.openPath(logsDir).catch((error) => {
            log('error', `[IPC管理] 打开日志文件夹失败: ${error.message}`);
            dialog.showErrorBox('打开文件夹失败', `无法打开日志文件夹: ${logsDir}\n错误: ${error.message}`);
        });
    });
}

module.exports = registerDiagnosticsIpc;
