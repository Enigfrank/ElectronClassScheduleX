const fs = require('fs');

const DEFAULT_EXIT_DELAY_MS = 1000;

/**
 * 等待指定毫秒数
 * @param {number} milliseconds - 等待时间
 * @returns {Promise<void>}
 */
function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * 记录日志
 * @param {Object|null} logger - 日志记录器
 * @param {string} level - 日志级别
 * @param {string} message - 日志内容
 */
function log(logger, level, message) {
    logger?.[level]?.(message);
}

/**
 * 打开课表配置文件夹，然后退出应用
 * Electron shell.openPath 失败时会返回错误字符串，因此必须显式检查返回值
 * @param {Object} options - 打开文件夹所需依赖
 * @returns {Promise<void>}
 */
async function openConfigFolderThenExit(options) {
    const {
        configDir,
        shell,
        app,
        dialog,
        logger = null,
        delay = wait,
        exitDelayMs = DEFAULT_EXIT_DELAY_MS
    } = options;
    const fileSystem = options.fs || fs;

    try {
        fileSystem.mkdirSync(configDir, { recursive: true });

        const openError = await shell.openPath(configDir);
        if (openError) {
            log(logger, 'error', `[课表配置] 打开配置文件夹失败: ${openError}`);
            await dialog.showMessageBox({
                type: 'error',
                title: '打开课表文件夹失败',
                message: '无法打开课表配置文件夹',
                detail: `${configDir}\n\n${openError}`,
                buttons: ['退出程序'],
                noLink: true
            });
        } else {
            await delay(exitDelayMs);
        }
    } catch (error) {
        log(logger, 'error', `[课表配置] 打开配置文件夹异常: ${error.message}`);
        await dialog.showMessageBox({
            type: 'error',
            title: '打开课表文件夹失败',
            message: '无法打开课表配置文件夹',
            detail: `${configDir}\n\n${error.message}`,
            buttons: ['退出程序'],
            noLink: true
        });
    } finally {
        app.quit();
    }
}

module.exports = {
    openConfigFolderThenExit
};
