const { Tray, Menu ,app} = require('electron');

class TrayManager {
    constructor(configManager, logger, windowManager) {
        this.configManager = configManager;
        this.logger = logger;
        this.windowManager = windowManager;
        this.tray = null;
    }

    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    createTray(iconPath) {
        if (this.tray) {
            try {
                this.tray.destroy();
            } catch (e) {
                this.log('warn', `[托盘管理] 销毁旧托盘失败: ${e.message}`);
            }
            this.tray = null;
        }
        
        try {
            this.tray = new Tray(iconPath);
            this.updateTrayMenu();
            
            this.tray.on('click', () => {
                this.onTrayClick();
            });

            this.log('info', '[托盘管理] 托盘创建成功');
            return this.tray;
        } catch (error) {
            this.log('error', `[托盘管理] 创建托盘失败: ${error.message}`);
            return null;
        }
    }

    onTrayClick() {
        this.windowManager.createReactGUIWindow();
    }

    updateTrayMenu() {
        if (this.tray) {
            const contextMenu = Menu.buildFromTemplate(this.getTrayMenuTemplate());
            this.tray.setContextMenu(contextMenu);
        }
    }

    getTrayMenuTemplate() {
        return [
            {
                icon: this.getAssetPath('image', 'setting.png'),
                label: '打开配置界面',
                click: () => this.windowManager.createReactGUIWindow()
            },
            { type: 'separator' },
            {
                icon: this.getAssetPath('image', 'quit.png'),
                label: '退出程序',
                click: () => this.showQuitConfirmation()
            }
        ];
    }

    showQuitConfirmation() {
        const { dialog } = require('electron');
        const mainWindow = this.windowManager.getWindow('main');
        
        dialog.showMessageBox(mainWindow, {
            title: '请确认',
            message: '你确定要退出程序吗?',
            buttons: ['取消', '确定']
        }).then((data) => { 
            if (data.response) {
                app.quit();
            }
        });
    }

    getAssetPath(...paths) {
        const path = require('path');
        return path.join(__dirname, '..', ...paths);
    }

    destroy() {
        if (this.tray) {
            try {
                // 移除所有事件监听器
                this.tray.removeAllListeners();
                // 销毁托盘图标
                this.tray.destroy();
            } catch (error) {
                this.log('error', `[托盘管理] 销毁托盘时出错: ${error.message}`);
            } finally {
                this.tray = null;
            }
        }
    }

    setToolTip(tooltip) {
        if (this.tray) {
            this.tray.setToolTip(tooltip);
        }
    }
}

module.exports = TrayManager;
