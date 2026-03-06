const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { app, dialog } = require('electron');
const iconv = require('iconv-lite');


class AutoLaunchManager {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        // 旧的快捷方式路径，用于清理
        this.startupFolderPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
        this.shortcutName = '电子课表(请勿重命名).lnk';
        // 任务计划名称
        this.taskName = 'ElectronClassScheduleX';
    }

    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    setAutoLaunch() {
        // 清理旧的快捷方式启动项
        this.cleanOldShortcuts();

        if (this.configManager.getAutoLaunch()) {
            this.log('info', '[自启动管理] 自启动已启用，创建计划任务');
            this.createScheduledTask();
        } else {
            this.log('info', '[自启动管理] 自启动已禁用，删除计划任务');
            this.removeScheduledTask();
        }
    }

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

    createScheduledTask() {
        const { app, dialog } = require('electron');

        // 防止开发环境错误注册 electron.exe
        if (!app.isPackaged) {
            this.log('warn', '[自启动管理] 开发环境跳过创建计划任务');
            return;
        }

        const exePath = path.normalize(app.getPath('exe'));

        // 正确的命令格式，注意引号包裹整个路径（处理含空格的路径如 Program Files）
        const command = `schtasks /Create /TN "${this.taskName}" /TR "${exePath}" /SC ONLOGON /RL HIGHEST /F`;

        this.log('info', `[自启动管理] 执行命令: ${command}`);

        try {
            exec(command, { windowsHide: true, encoding: 'buffer' }, (error, stdout, stderr) => {
                try {
                    // 使用 GBK 解码避免中文乱码
                    const stdoutStr = stdout ? iconv.decode(stdout, 'gbk') : '';
                    const stderrStr = stderr ? iconv.decode(stderr, 'gbk') : '';
    
                    // 检测权限错误（支持中英文）
                    const isAccessDenied =
                        stderrStr.includes('Access is denied') ||
                        stderrStr.includes('拒绝访问') ||
                        stderrStr.includes('error');
    
                    if (error) {
                        this.log('error', `[自启动管理] 创建失败: ${stderrStr || stdoutStr}`);
    
                        if (isAccessDenied) {
                            dialog.showErrorBox('权限不足',
                                '无法创建管理员权限的自启动任务。\n\n请以[管理员身份]运行此程序后再试。');
                        }
                    } else {
                        this.log('info', '[自启动管理] 计划任务创建成功');
                    }
                } catch (callbackError) {
                    this.log('error', `[自启动管理] 回调处理出错: ${callbackError.message}`);
                }
            });
        } catch (execError) {
            this.log('error', `[自启动管理] 执行命令出错: ${execError.message}`);
        }
    }

    removeScheduledTask() {
        const command = `schtasks /Delete /TN "${this.taskName}" /F`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                // 如果任务不存在，不视为错误
                if (stderr && !stderr.includes('The system cannot find the file specified')) {
                    this.log('error', `[自启动管理] 删除计划任务失败: ${error.message}`);
                }
            } else {
                this.log('info', '[自启动管理] 计划任务删除成功');
            }
        });
    }

    isAutoLaunchEnabled() {
        // 由于任务计划检查是异步的，这里直接返回配置状态
        return this.configManager.getAutoLaunch();
    }

    updateAutoLaunch(enabled) {
        this.log('info', `[自启动管理] 更新自启动设置: ${enabled}`);
        this.configManager.setAutoLaunch(enabled);
        this.setAutoLaunch();
    }
}

module.exports = AutoLaunchManager;