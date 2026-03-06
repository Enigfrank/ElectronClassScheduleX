const { Tray, Menu, app } = require('electron');

/**
 * 系统托盘管理模块
 * 负责创建、更新和显示系统托盘图标及其右键菜单
 */
class TrayManager {
    /**
     * @param {ConfigManager} configManager - 配置管理器实例
     * @param {Object} logger - 日志记录器实例
     * @param {WindowManager} windowManager - 窗口管理器实例
     */
    constructor(configManager, logger, windowManager) {
        this.configManager = configManager;
        this.logger = logger;
        this.windowManager = windowManager;
        this.tray = null;
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

    /**
     * 创建系统托盘图标
     * @param {string} iconPath - 托盘图标的绝对路径
     * @returns {Tray|null} 托盘实例
     */
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

    /**
     * 托盘图标被点击时的回调函数
     */
    onTrayClick() {
        this.windowManager.createReactGUIWindow();
    }

    /**
     * 根据当前状态更新托盘菜单
     */
    updateTrayMenu() {
        if (this.tray) {
            const contextMenu = Menu.buildFromTemplate(this.getTrayMenuTemplate());
            this.tray.setContextMenu(contextMenu);
        }
    }

    /**
     * 获取托盘菜单的模板
     * @returns {Array} 菜单模板数组
     */
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

    /**
     * 显示退出程序的确认对话框
     */
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

    /**
     * 获取资源文件的物理路径
     * @param {...string} paths - 路径片段
     * @returns {string} 绝对路径
     */
    getAssetPath(...paths) {
        const path = require('path');
        return path.join(__dirname, '..', ...paths);
    }

    /**
     * 销毁托盘实例并清理资源
     */
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

    /**
     * 设置托盘工具提示文本
     * @param {string} tooltip - 提示文本内容
     */
    setToolTip(tooltip) {
        if (this.tray) {
            this.tray.setToolTip(tooltip);
        }
    }
}

module.exports = TrayManager;
