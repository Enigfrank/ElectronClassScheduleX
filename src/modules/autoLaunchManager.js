const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { exec } = require('child_process');
const { app, dialog } = require('electron');
const iconv = require('iconv-lite');

const execPromise = promisify(exec);

/**
 * 管理程序的自启动功能（针对 Windows 任务计划程序）
 */
class AutoLaunchManager {
    /**
     * @param {Object} configManager - 配置管理实例
     * @param {Object} logger - 日志管理实例
     */
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        // 旧的快捷方式路径（用于清理）
        this.startupFolderPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
        this.shortcutName = '电子课表(请勿重命名).lnk';
        // 任务计划名称
        this.taskName = 'ElectronClassScheduleX';
        // 平台判断
        this.isWindows = process.platform === 'win32';
    }

    /**
     * 统一日志格式
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](`[自启动管理] ${message}`);
        }
    }

    /**
     * 根据配置设置或取消自启动
     */
    async setAutoLaunch() {
        if (!this.isWindows) {
            this.log('warn', '非 Windows 平台，忽略自启动设置');
            return;
        }

        const shouldEnable = this.configManager.getAutoLaunch();
        const taskExists = await this.isTaskExists(); // 避免重复操作

        if (shouldEnable) {
            this.cleanOldShortcuts();
            if (taskExists) {
                this.log('info', '计划任务已存在，无需创建');
            } else {
                await this.createScheduledTask();
            }
        } else {
            if (taskExists) {
                await this.removeScheduledTask();
            } else {
                this.log('info', '计划任务不存在，无需删除');
            }
        }
    }

    /**
     * 清理旧版本的快捷方式启动项
     */
    cleanOldShortcuts() {
        try {
            const shortcutPath = path.join(this.startupFolderPath, this.shortcutName);
            if (fs.existsSync(shortcutPath)) {
                fs.unlinkSync(shortcutPath);
                this.log('info', '已清理旧的启动快捷方式');
            }
        } catch (err) {
            this.log('warn', `清理旧快捷方式失败: ${err.message}`);
        }
    }

    /**
     * 创建 Windows 计划任务（需要管理员权限）
     */
    async createScheduledTask() {
        if (!this.isWindows) return;

        // 开发环境跳过，防止错误注册 electron.exe
        if (!app.isPackaged) {
            this.log('warn', '开发环境跳过创建计划任务');
            return;
        }

        const exePath = path.normalize(app.getPath('exe'));
        // 添加环境变量标识，让应用知道是通过任务计划程序启动的
        const command = `schtasks /Create /TN "${this.taskName}" /TR "cmd /c set STARTED_BY_TASK_SCHEDULER=1 && \\"${exePath}\\"" /SC ONLOGON /RL HIGHEST /F`;

        this.log('info', `执行命令：${command}`);

        try {
            const { stdout, stderr } = await execPromise(command, {
                windowsHide: true,
                encoding: 'buffer'
            });

            const stdoutStr = iconv.decode(stdout, 'gbk');
            const stderrStr = iconv.decode(stderr, 'gbk');

            if (stderrStr && this.isAccessDeniedError(stderrStr)) {
                // 明确的权限错误
                this.log('error', `创建失败: ${stderrStr}`);
                this.showPermissionError();
            } else {
                // 成功（可能有些成功信息输出到 stderr，如中文系统）
                this.log('info', `计划任务创建成功${stderrStr ? ` (附加信息: ${stderrStr})` : ''}`);
            }
        } catch (error) {
            // 命令执行失败（退出码非0）
            const stderrStr = error.stderr ? iconv.decode(error.stderr, 'gbk') : '';
            const stdoutStr = error.stdout ? iconv.decode(error.stdout, 'gbk') : '';
            this.log('error', `创建失败: ${stderrStr || stdoutStr || error.message}`);

            if (this.isAccessDeniedError(stderrStr)) {
                this.showPermissionError();
            }
        }
    }

    /**
     * 删除已存在的 Windows 计划任务
     */
    async removeScheduledTask() {
        if (!this.isWindows) return;

        const command = `schtasks /Delete /TN "${this.taskName}" /F`;
        try {
            await execPromise(command, { windowsHide: true });
            this.log('info', '计划任务删除成功');
        } catch (error) {
            const stderrStr = error.stderr ? iconv.decode(error.stderr, 'gbk') : '';
            // 任务不存在时不视为错误
            if (stderrStr.includes('The system cannot find the file specified') ||
                stderrStr.includes('找不到指定的文件')) {
                this.log('info', '计划任务不存在，无需删除');
            } else {
                this.log('error', `删除计划任务失败: ${stderrStr || error.message}`);
            }
        }
    }

    /**
     * 检查计划任务是否已存在
     * @returns {Promise<boolean>}
     */
    async isTaskExists() {
        if (!this.isWindows) return false;
        const command = `schtasks /Query /TN "${this.taskName}"`;
        try {
            await execPromise(command, { windowsHide: true });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 判断 stderr 是否包含权限拒绝信息
     */
    isAccessDeniedError(stderr) {
        return stderr.includes('Access is denied') ||
               stderr.includes('拒绝访问') ||
               stderr.includes('ERROR: Access is denied'); // 更精确匹配
    }

    /**
     * 显示权限不足的对话框
     */
    showPermissionError() {
        dialog.showErrorBox(
            '权限不足',
            '无法创建管理员权限的自启动任务。\n\n请以【管理员身份】运行此程序后再试。'
        );
    }

    /**
     * 返回当前配置中的自启动状态（不查询实际任务）
     * @returns {boolean}
     */
    isAutoLaunchEnabled() {
        return this.configManager.getAutoLaunch();
    }

    /**
     * 更新自启动配置并应用更改（仅当状态变化时执行）
     * @param {boolean} enabled - 是否启用自启动
     */
    async updateAutoLaunch(enabled) {
        if (this.configManager.getAutoLaunch() === enabled) {
            this.log('info', `自启动设置未变化: ${enabled}`);
            return;
        }
        this.log('info', `更新自启动设置: ${enabled}`);
        this.configManager.setAutoLaunch(enabled);
        await this.setAutoLaunch();
    }
}

module.exports = AutoLaunchManager;