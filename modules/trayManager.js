const { Tray, Menu } = require('electron');

class TrayManager {
    constructor(configManager, logger, windowManager) {
        this.configManager = configManager;
        this.logger = logger;
        this.windowManager = windowManager;
        this.tray = null;
    }

    // 创建托盘
    createTray(iconPath) {
        // 如果已存在托盘实例，先销毁
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
        
        this.tray = new Tray(iconPath);
        this.updateTrayMenu();
        
        // 托盘点击事件
        this.tray.on('click', () => {
            this.onTrayClick();
        });

        return this.tray;
    }

    // 托盘点击事件处理
    onTrayClick() {
        this.windowManager.createGUIWindow();
    }

    // 更新托盘菜单
    updateTrayMenu() {
        if (this.tray) {
            const contextMenu = Menu.buildFromTemplate(this.getTrayMenuTemplate());
            this.tray.setContextMenu(contextMenu);
        }
    }

    // 获取托盘菜单模板
    getTrayMenuTemplate() {
        return [
            {
                icon: this.getAssetPath('image', 'setting.png'),
                label: '打开配置界面',
                click: () => this.onTrayClick()
            },
            { type: 'separator' },
            {
                icon: this.getAssetPath('image', 'quit.png'),
                label: '退出程序',
                click: () => this.showQuitConfirmation()
            }
        ];
    }

    // 显示退出确认对话框
    showQuitConfirmation() {
        const { dialog } = require('electron');
        const mainWindow = this.windowManager.getWindow('main');
        
        dialog.showMessageBox(mainWindow, {
            title: '请确认',
            message: '你确定要退出程序吗?',
            buttons: ['取消', '确定']
        }).then((data) => { 
            if (data.response) {
                const { app } = require('electron');
                app.quit();
            }
        });
    }

    // 获取资源路径
    getAssetPath(...paths) {
        const path = require('path');
        return path.join(__dirname, '..', ...paths);
    }

    // 销毁托盘
    destroy() {
        if (this.tray) {
            this.tray.destroy();
            this.tray = null;
        }
    }

    // 设置托盘提示
    setToolTip(tooltip) {
        if (this.tray) {
            this.tray.setToolTip(tooltip);
        }
    }
}

module.exports = TrayManager;