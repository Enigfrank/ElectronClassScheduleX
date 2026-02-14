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
            this.tray.destroy();
            this.tray = null;
        }
        
        this.log('info', '[托盘管理] 开始创建系统托盘');
        
        this.tray = new Tray(iconPath);
        this.updateTrayMenu();
        
        this.tray.on('click', () => {
            this.onTrayClick();
        });

        this.log('info', '[托盘管理] 系统托盘创建成功');
        return this.tray;
    }

    onTrayClick() {
        this.log('info', '[托盘管理] 托盘图标被点击');
        this.windowManager.createReactGUIWindow();
    }

    updateTrayMenu() {
        if (this.tray) {
            const contextMenu = Menu.buildFromTemplate(this.getTrayMenuTemplate());
            this.tray.setContextMenu(contextMenu);
            this.log('info', '[托盘管理] 托盘菜单已更新');
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
        this.log('info', '[托盘管理] 显示退出确认对话框');
        
        const { dialog } = require('electron');
        const mainWindow = this.windowManager.getWindow('main');
        
        dialog.showMessageBox(mainWindow, {
            title: '请确认',
            message: '你确定要退出程序吗?',
            buttons: ['取消', '确定']
        }).then((data) => { 
            if (data.response) {
                this.log('info', '[托盘管理] 用户确认退出程序');
                app.quit();
            } else {
                this.log('info', '[托盘管理] 用户取消退出程序');
            }
        });
    }

    getAssetPath(...paths) {
        const path = require('path');
        return path.join(__dirname, '..', ...paths);
    }

    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
            this.log('info', '[托盘管理] 托盘已销毁');
        }
    }

    setToolTip(tooltip) {
        if (this.tray) {
            this.tray.setToolTip(tooltip);
            this.log('info', `[托盘管理] 设置托盘提示: ${tooltip}`);
        }
    }
}

module.exports = TrayManager;