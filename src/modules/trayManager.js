const { Tray, Menu, app, dialog } = require('electron');
const path = require('path');

/**
 * 系统托盘管理模块
 * 负责创建、更新和显示系统托盘图标及其右键菜单
 */
class TrayManager {
    /**
     * @param {Object} configManager - [冗余占位] 配置管理器实例（当前未使用，保留以防外部按位置传参错位）
     * @param {Object} logger - 日志记录器实例
     * @param {WindowManager} windowManager - 窗口管理器实例
     */
    constructor(configManager, logger, windowManager) {
        this.logger = logger;
        this.windowManager = windowManager;
        this.tray = null;
    }

    log(level, message) {
        this.logger?.[level]?.(message);
    }

    createTray(iconPath) {
        this.destroy();

        try {
            this.tray = new Tray(iconPath);
            this.updateTrayMenu();

            // 简化箭头函数
            this.tray.on('click', () => this.onTrayClick());

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
        if (!this.tray) return; 
        
        const contextMenu = Menu.buildFromTemplate(this.getTrayMenuTemplate());
        this.tray.setContextMenu(contextMenu);
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
        const mainWindow = this.windowManager.getWindow('main');

        dialog.showMessageBox(mainWindow, {
            type: 'question',
            title: '请确认',
            message: '你确定要退出程序吗?',
            buttons: ['取消', '确定'],
            defaultId: 0,
            cancelId: 0
        }).then(({ response }) => {
            if (response === 1) app.quit();
        });
    }

    getAssetPath(...paths) {
        return path.join(__dirname, '..', ...paths);
    }

    destroy() {
        if (!this.tray) return;

        try {
            if (!this.tray.isDestroyed()) {
                this.tray.destroy();
            }
        } catch (error) {
            this.log('error', `[托盘管理] 销毁托盘时出错: ${error.message}`);
        } finally {
            this.tray = null;
        }
    }

    setToolTip(tooltip) {
        this.tray?.setToolTip(tooltip);
    }

    hasTray() {
        return !!this.tray && !this.tray.isDestroyed();
    }
}

module.exports = TrayManager;