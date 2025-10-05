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

    // 设置自启动
    setAutoLaunch() {
        const { app } = require('electron');
        
        // 先禁用 Electron 内置的自启动
        app.setLoginItemSettings({
            openAtLogin: false,
            openAsHidden: false
        });

        if (this.configManager.getAutoLaunch()) {
            this.createStartupShortcut();
        } else {
            this.removeStartupShortcut();
        }
    }

    // 创建启动快捷方式
    createStartupShortcut() {
        const { app } = require('electron');
        
        createShortcut.create(path.join(this.startupFolderPath, this.shortcutName), {
            target: app.getPath('exe'),
            workingDir: path.dirname(app.getPath('exe')),
        }, (err) => {
            if (err) {
                this.logger.error('Error creating shortcut:', err);
                const { dialog } = require('electron');
                dialog.showErrorBox('错误', '创建快捷方式时出错: ' + err.message);
            } else {
                this.logger.info('Startup shortcut created successfully');
            }
        });
    }

    // 删除启动快捷方式
    removeStartupShortcut() {
        fs.unlink(path.join(this.startupFolderPath, this.shortcutName), (err) => {
            if (err) {
                if (err.code !== 'ENOENT') { // 文件不存在不是错误
                    this.logger.error('Error deleting shortcut:', err);
                    const { dialog } = require('electron');
                    dialog.showErrorBox('错误', '删除快捷方式时出错: ' + err.message);
                }
            } else {
                this.logger.info('Startup shortcut removed successfully');
            }
        });
    }

    // 检查自启动状态
    isAutoLaunchEnabled() {
        return fs.existsSync(path.join(this.startupFolderPath, this.shortcutName));
    }

    // 更新自启动设置
    updateAutoLaunch(enabled) {
        this.configManager.setAutoLaunch(enabled);
        this.setAutoLaunch();
    }
}

module.exports = AutoLaunchManager;