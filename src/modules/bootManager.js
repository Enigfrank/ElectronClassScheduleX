const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * 启动流程管理模块
 * 负责处理 OOBE 和 Loading 窗口的显示逻辑
 */
class BootManager {
    /**
     * @param {WindowManager} windowManager
     * @param {ConfigManager} configManager
     * @param {Logger} logger
     */
    constructor(windowManager, configManager, logger) {
        this.windowManager = windowManager;
        this.configManager = configManager;
        this.logger = logger;
        this.loadingDialog = null;
    }

    /**
     * 显示OOBE引导窗口
     */
    showOobe() {
        this.log('info', '[OOBE] 显示OOBE引导窗口');
        this.windowManager.createOobeWindow();
    }

    /**
     * 显示加载对话框
     * @param {BrowserWindow} parentWindow - 父窗口（可选）
     */
    showLoading(parentWindow = null) {
        // 如果已经存在，先关闭
        if (this.loadingDialog && !this.loadingDialog.isDestroyed()) {
            this.loadingDialog.close();
        }

        this.loadingDialog = new BrowserWindow({
            width: 600,
            height: 400,
            frame: false,
            alwaysOnTop: true,
            modal: true,
            parent: parentWindow || null,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        this.loadingDialog.loadFile(path.join(__dirname, '..', 'loading.html'));
    }

    /**
     * 关闭加载对话框
     */
    closeLoading() {
        try {
            if (this.loadingDialog && !this.loadingDialog.isDestroyed()) {
                this.loadingDialog.close();
                this.loadingDialog = null;
            }
        } catch (error) {
            this.log('warn', `关闭加载窗口失败: ${error.message}`);
        }
    }

    /**
     * 检查 OOBE 是否完成
     * @returns {boolean}
     */
    isOobeCompleted() {
        return this.configManager.getOobeCompleted();
    }

    log(level, msg) {
        if (this.logger) {
            this.logger[level](msg);
        }
    }
}

module.exports = BootManager;
