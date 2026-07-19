const { normalizeExamEntries } = require('../../shared/examMode');

/**
 * 将未知异常转换为可展示的消息。
 * @param {*} error 未知异常
 * @returns {string} 错误消息
 */
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * 注册考试模式配置、应用和退出 IPC。
 * @param {{ipcMain: Electron.IpcMain, configManager: Object, windowManager: Object, log: Function}} dependencies 注册依赖
 */
function registerExamModeIpc({ ipcMain, configManager, windowManager, log }) {
    ipcMain.handle('get-exam-mode-config', () => {
        try {
            const result = normalizeExamEntries(configManager.get('examModeEntries', []), { requireEntries: false });
            if (!result.valid) {
                log('error', '[考试模式] 已保存的考试配置无效');
                return {
                    success: false,
                    entries: [],
                    error: '已保存的考试配置无效，请重新设置'
                };
            }
            return { success: true, entries: result.entries };
        } catch (error) {
            const message = getErrorMessage(error);
            log('error', `[考试模式] 读取配置失败: ${message}`);
            return { success: false, entries: [], error: `读取考试配置失败：${message}` };
        }
    });

    ipcMain.handle('apply-exam-mode', async (event, input) => {
        const result = normalizeExamEntries(input);
        if (!result.valid) {
            return { success: false, saved: false, errors: result.errors };
        }

        try {
            configManager.set('examModeEntries', result.entries);
        } catch (error) {
            const message = getErrorMessage(error);
            log('error', `[考试模式] 保存配置失败: ${message}`);
            return { success: false, saved: false, error: `保存考试配置失败：${message}` };
        }

        try {
            await windowManager.enterExamMode(result.entries);
            return { success: true, saved: true, entries: result.entries };
        } catch (error) {
            const message = getErrorMessage(error);
            log('error', `[考试模式] 应用配置失败: ${message}`);
            return {
                success: false,
                saved: true,
                entries: result.entries,
                error: `考试窗口启动失败：${message}。配置已保存，请重试。`
            };
        }
    });

    ipcMain.handle('exit-exam-mode', async () => {
        try {
            await windowManager.exitExamMode();
            return { success: true };
        } catch (error) {
            const message = getErrorMessage(error);
            log('error', `[考试模式] 退出失败: ${message}`);
            return { success: false, error: `退出考试模式失败：${message}` };
        }
    });
}

module.exports = registerExamModeIpc;
