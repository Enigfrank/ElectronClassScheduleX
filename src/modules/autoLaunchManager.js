const fs = require('fs');
const path = require('path');
const os = require('os');
const createShortcut = require('windows-shortcuts');

class AutoLaunchManager {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.startupFolderPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
        this.shortcutName = '电子课表(请勿重命名).lnk';
    }

    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    setAutoLaunch() {
        this.log('info', '[自启动管理] 开始设置自启动');
        const { app } = require('electron');
        
        app.setLoginItemSettings({
            openAtLogin: false,
            openAsHidden: false
        });

        if (this.configManager.getAutoLaunch()) {
            this.log('info', '[自启动管理] 自启动已启用，创建快捷方式');
            this.createStartupShortcut();
        } else {
            this.log('info', '[自启动管理] 自启动已禁用，删除快捷方式');
            this.removeStartupShortcut();
        }
    }

    createStartupShortcut() {
        const { app } = require('electron');
        
        createShortcut.create(path.join(this.startupFolderPath, this.shortcutName), {
            target: app.getPath('exe'),
            workingDir: path.dirname(app.getPath('exe')),
        }, (err) => {
            if (err) {
                this.log('error', `[自启动管理] 创建快捷方式失败: ${err.message}`);
                const { dialog } = require('electron');
                dialog.showErrorBox('错误', '创建快捷方式时出错: ' + err.message);
            } else {
                this.log('info', '[自启动管理] 启动快捷方式创建成功');
            }
        });
    }

    removeStartupShortcut() {
        fs.unlink(path.join(this.startupFolderPath, this.shortcutName), (err) => {
            if (err) {
                if (err.code !== 'ENOENT') {
                    this.log('error', `[自启动管理] 删除快捷方式失败: ${err.message}`);
                    const { dialog } = require('electron');
                    dialog.showErrorBox('错误', '删除快捷方式时出错: ' + err.message);
                }
            } else {
                this.log('info', '[自启动管理] 启动快捷方式删除成功');
            }
        });
    }

    isAutoLaunchEnabled() {
        return fs.existsSync(path.join(this.startupFolderPath, this.shortcutName));
    }

    updateAutoLaunch(enabled) {
        this.log('info', `[自启动管理] 更新自启动设置: ${enabled}`);
        this.configManager.setAutoLaunch(enabled);
        this.setAutoLaunch();
    }
}

module.exports = AutoLaunchManager;