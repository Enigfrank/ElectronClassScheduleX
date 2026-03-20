const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { app, dialog } = require('electron');
const iconv = require('iconv-lite');


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
        // 旧的快捷方式路径，用于清理
        this.startupFolderPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
        this.shortcutName = '电子课表(请勿重命名).lnk';
        // 任务计划名称
        this.taskName = 'ElectronClassScheduleX';
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别 (info, warn, error)
     * @param {string} message - 日志内容
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    /**
     * 根据当前配置设置或取消自启动
     */
    setAutoLaunch() {
        // 始终尝试清理旧的自启动方式（快捷方式和计划任务）
        this.cleanOldAutoLaunchMethods();

        const enabled = this.configManager.getAutoLaunch();

        // 仅在打包后的应用中设置自启动
        if (!app.isPackaged) {
            this.log('warn', '[自启动管理] 开发环境跳过设置自启动');
            return;
        }

        try {
            this.log('info', `[自启动管理] 正在将自启动状态设置为: ${enabled}`);
            app.setLoginItemSettings({
                openAtLogin: enabled,
                path: app.getPath('exe')
            });
            this.log('info', '[自启动管理] Electron API 设置成功');
        } catch (err) {
            this.log('error', `[自启动管理] 通过 Electron API 设置自启动失败: ${err.message}`);
        }
    }

    /**
     * 清理所有旧版本的自启动方式
     */
    cleanOldAutoLaunchMethods() {
        this.cleanOldShortcuts();
        this.removeOldScheduledTask();
    }

    /**
     * 清理旧版本的快捷方式启动项
     */
    cleanOldShortcuts() {
        try {
            const shortcutPath = path.join(this.startupFolderPath, this.shortcutName);
            if (fs.existsSync(shortcutPath)) {
                fs.unlinkSync(shortcutPath);
                this.log('info', '[自启动管理] 已清理旧的启动快捷方式');
            }
        } catch (err) {
            this.log('warn', `[自启动管理] 清理旧快捷方式失败: ${err.message}`);
        }
    }

    /**
     * 删除旧版本创建的 Windows 计划任务
     */
    removeOldScheduledTask() {
        // 防止开发环境误删其他任务（虽然任务名很具体）
        const command = `schtasks /Delete /TN "${this.taskName}" /F`;

        // 使用 encoding: 'buffer' 以获取原始字节流，便于后续正确解码
        exec(command, { windowsHide: true, encoding: 'buffer' }, (error, stdout, stderr) => {
            if (error) {
                // 将 stderr 从 GBK 解码为 UTF-8 字符串，解决 Windows 下的乱码问题
                const stderrStr = stderr ? iconv.decode(stderr, 'cp936') : '';
                
                // 检查是否为“找不到文件”或“找不到任务”错误，这类错误在清理旧任务时是正常的
                const isNotFoundError = stderrStr.includes('ERROR: The system cannot find the file specified') || 
                                     stderrStr.includes('错误: 系统找不到指定的文件') ||
                                     stderrStr.includes('错误: 系统找不到指定的计划任务');

                if (!isNotFoundError) {
                    // 只有在不是“找不到”的情况下才记录警告
                    this.log('warn', `[自启动管理] 尝试清理旧计划任务时发生非预期错误: ${stderrStr.trim() || error.message}`);
                }
            } else {
                this.log('info', `[自启动管理] 已成功清理旧的计划任务: ${this.taskName}`);
            }
        });
    }

    /**
     * 检查自启动是否已启用
     * @returns {boolean}
     */
    isAutoLaunchEnabled() {
        // 优先检查 Electron API 的实际状态
        if (app.isPackaged) {
            try {
                const settings = app.getLoginItemSettings();
                return settings.openAtLogin;
            } catch (err) {
                this.log('warn', `[自启动管理] 获取自启动状态失败: ${err.message}`);
            }
        }
        return this.configManager.getAutoLaunch();
    }

    /**
     * 更新自启动配置并应用更改
     * @param {boolean} enabled - 是否启用自启动
     */
    updateAutoLaunch(enabled) {
        this.log('info', `[自启动管理] 用户更新自启动设置: ${enabled}`);
        this.configManager.setAutoLaunch(enabled);
        this.setAutoLaunch();
    }
}


module.exports = AutoLaunchManager;