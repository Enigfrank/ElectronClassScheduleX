const { BrowserWindow, screen } = require('electron');
const path = require('path');

/**
 * 作业窗口管理器
 * 负责创建、显示、隐藏作业窗口，以及管理作业数据的过滤和展示
 */
class AssignmentWindowManager {
    /**
     * 构造函数
     * @param {AssignmentConfigManager} assignmentConfigManager - 作业配置管理器实例
     * @param {Logger} logger - 日志管理器实例
     */
    constructor(assignmentConfigManager, logger) {
        this.assignmentConfigManager = assignmentConfigManager;
        this.logger = logger;
        this.window = null;
        this.currentAssignments = [];
        this.callbacks = {
            onShow: null,
            onHide: null
        };
        this.windowConfig = {
            baseWidth: 410,
            cardHeight: 180,
            minHeight: 350,
            maxScreenHeightRatio: 0.7,
            marginFromEdge: 20
        };
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
     * 计算窗口大小
     * @param {number} assignmentCount - 作业数量
     * @returns {Object} 包含width和height的对象
     */
    calculateWindowSize(assignmentCount) {
        const display = screen.getPrimaryDisplay();
        const { height: screenHeight } = display.workAreaSize;

        const headerHeight = 70;
        const listPadding = 48;
        const cardGap = 16;
        const cardHeight = this.windowConfig.cardHeight;
        const emptyStateHeight = 150;

        let contentHeight;
        if (assignmentCount === 0) {
            contentHeight = emptyStateHeight;
        } else {
            contentHeight = assignmentCount * cardHeight + (assignmentCount - 1) * cardGap;
        }

        let totalHeight = headerHeight + listPadding + contentHeight;
        const maxHeight = Math.floor(screenHeight * this.windowConfig.maxScreenHeightRatio);

        totalHeight = Math.max(this.windowConfig.minHeight, Math.min(totalHeight, maxHeight));

        return {
            width: this.windowConfig.baseWidth,
            height: totalHeight
        };
    }

    /**
     * 调整窗口大小
     * @param {number} assignmentCount - 作业数量
     */
    resizeWindow(assignmentCount) {
        if (!this.window || this.window.isDestroyed()) {
            return;
        }

        const display = screen.getPrimaryDisplay();
        const { width: screenWidth } = display.workAreaSize;
        const windowSize = this.calculateWindowSize(assignmentCount);

        this.window.setSize(windowSize.width, windowSize.height);
        this.window.setPosition(
            screenWidth - windowSize.width - this.windowConfig.marginFromEdge,
            this.windowConfig.marginFromEdge
        );

        this.log('info', `[作业窗口] 调整窗口大小: ${windowSize.width}x${windowSize.height}, 作业数量: ${assignmentCount}`);
    }

    /**
     * 创建作业窗口
     * @returns {BrowserWindow|null} 创建的窗口实例，如果创建失败返回null
     */
    createWindow() {
        if (this.window && !this.window.isDestroyed()) {
            this.log('info', '[作业窗口] 窗口已存在，返回现有窗口');
            return this.window;
        }

        this.log('info', '[作业窗口] 开始创建作业窗口');

        const display = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = display.workAreaSize;
        const windowSize = this.calculateWindowSize(0);

        try {
            this.window = new BrowserWindow({
                width: windowSize.width,
                height: windowSize.height,
                x: screenWidth - windowSize.width - this.windowConfig.marginFromEdge,
                y: this.windowConfig.marginFromEdge,
                frame: false,
                transparent: true,
                alwaysOnTop: true,
                resizable: false,
                skipTaskbar: true,
                show: false,
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    enableRemoteModule: true
                }
            });

            const htmlPath = path.join(__dirname, '..', 'assignment.html');
            this.window.loadFile(htmlPath).catch(err => {
                this.log('error', `[作业窗口] 加载页面失败: ${err.message}`);
            });

            this.window.on('closed', () => {
                this.window = null;
                this.log('info', '[作业窗口] 窗口已关闭');
            });

            this.window.on('ready-to-show', () => {
                this.log('info', '[作业窗口] 窗口准备就绪');
            });

            this.log('info', '[作业窗口] 作业窗口创建成功');
            return this.window;
        } catch (err) {
            this.log('error', `[作业窗口] 创建窗口失败: ${err.message}`);
            return null;
        }
    }



    /**
     * 过滤当天作业
     * @param {Array} assignments - 作业列表
     * @returns {Array} 过滤后的当天作业列表
     */
    filterTodayAssignments(assignments) {
        if (!Array.isArray(assignments)) {
            return [];
        }

        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDate = today.getDate();

        return assignments.filter(assignment => {
            if (!assignment.created_at) {
                return false;
            }

            const assignDate = new Date(assignment.created_at);
            return (
                assignDate.getFullYear() === todayYear &&
                assignDate.getMonth() === todayMonth &&
                assignDate.getDate() === todayDate
            );
        });
    }

    /**
     * 判断是否应该显示窗口
     * @param {Object} scheduleStatus - 当前课程状态（可选）
     * @param {number} scheduleStatus.currentPeriod - 当前节次（-1表示已放学）
     * @param {number} scheduleStatus.totalPeriods - 当天总课程节数
     * @param {boolean} scheduleStatus.isAfterSchool - 是否已放学
     * @returns {boolean} 是否应该显示窗口
     */
    shouldShowWindow(scheduleStatus = null) {
        const displayPeriod = this.assignmentConfigManager.getAssignmentDisplayPeriod();

        // 处理自定义时间格式: time:HH:MM
        if (typeof displayPeriod === 'string' && displayPeriod.startsWith('time:')) {
            const timeStr = displayPeriod.replace('time:', '');
            const [targetHour, targetMinute] = timeStr.split(':').map(Number);
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();

            // 如果当前时间已超过目标时间，返回true
            if (currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute)) {
                return true;
            }
            return false;
        }

        // -1表示当天所有课程结束后显示（默认行为）
        // 需要课程状态参数
        if (displayPeriod === -1 || typeof displayPeriod !== 'number') {
            // 如果没有提供课程状态，暂时返回false
            if (!scheduleStatus) {
                return false;
            }
            return scheduleStatus.isAfterSchool === true ||
                scheduleStatus.currentPeriod === -1 ||
                scheduleStatus.currentPeriod >= scheduleStatus.totalPeriods;
        }

        return false;
    }

    /**
     * 显示窗口并渲染作业
     * @param {Array} assignments - 作业列表
     */
    showWindow(assignments) {
        if (!this.window || this.window.isDestroyed()) {
            this.createWindow();
        }

        if (!this.window) {
            this.log('error', '[作业窗口] 无法显示窗口，窗口创建失败');
            return;
        }

        const todayAssignments = this.filterTodayAssignments(assignments);
        this.currentAssignments = todayAssignments;

        this.resizeWindow(todayAssignments.length);

        this.window.webContents.once('did-finish-load', () => {
            this.window.webContents.send('update-assignments', todayAssignments);
            this.window.show();
            this.log('info', `[作业窗口] 显示窗口，作业数量: ${todayAssignments.length}`);

            if (this.callbacks.onShow) {
                this.callbacks.onShow(todayAssignments);
            }
        });

        if (this.window.webContents.isLoading()) {
            return;
        }

        this.window.webContents.send('update-assignments', todayAssignments);
        this.window.show();
        this.log('info', `[作业窗口] 显示窗口，作业数量: ${todayAssignments.length}`);

        if (this.callbacks.onShow) {
            this.callbacks.onShow(todayAssignments);
        }
    }

    /**
     * 隐藏窗口
     */
    hideWindow() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.hide();
            this.log('info', '[作业窗口] 隐藏窗口');

            if (this.callbacks.onHide) {
                this.callbacks.onHide();
            }
        }
    }

    /**
     * 更新作业列表
     * @param {Array} assignments - 新的作业列表
     * @param {boolean} autoShow - 是否自动显示窗口（如果窗口当前可见）
     */
    updateAssignments(assignments, autoShow = true) {
        const todayAssignments = this.filterTodayAssignments(assignments);
        this.currentAssignments = todayAssignments;

        if (this.window && !this.window.isDestroyed()) {
            if (this.window.isVisible() || autoShow) {
                this.resizeWindow(todayAssignments.length);
                this.window.webContents.send('update-assignments', todayAssignments);
                this.log('info', `[作业窗口] 更新作业列表，数量: ${todayAssignments.length}`);
            }
        }
    }

    /**
     * 获取当前作业列表
     * @returns {Array} 当前作业列表
     */
    getCurrentAssignments() {
        return this.currentAssignments;
    }

    /**
     * 检查窗口是否存在
     * @returns {boolean} 窗口是否存在且未被销毁
     */
    windowExists() {
        return this.window && !this.window.isDestroyed();
    }

    /**
     * 检查窗口是否可见
     * @returns {boolean} 窗口是否可见
     */
    isWindowVisible() {
        return this.windowExists() && this.window.isVisible();
    }

    /**
     * 设置事件回调
     * @param {string} event - 事件名称（onShow, onHide）
     * @param {Function} callback - 回调函数
     */
    on(event, callback) {
        if (this.callbacks.hasOwnProperty(event)) {
            this.callbacks[event] = callback;
            this.log('info', `[作业窗口] 设置回调: ${event}`);
        } else {
            this.log('warn', `[作业窗口] 未知事件: ${event}`);
        }
    }

    /**
     * 移除事件回调
     * @param {string} event - 事件名称
     */
    off(event) {
        if (this.callbacks.hasOwnProperty(event)) {
            this.callbacks[event] = null;
            this.log('info', `[作业窗口] 移除回调: ${event}`);
        }
    }

    /**
     * 销毁窗口
     */
    destroyWindow() {
        if (this.window && !this.window.isDestroyed()) {
            this.window.close();
            this.window = null;
            this.currentAssignments = [];
            this.log('info', '[作业窗口] 窗口已销毁');
        }
    }

    /**
     * 关闭并清理资源
     */
    close() {
        this.destroyWindow();
        this.callbacks = {
            onShow: null,
            onHide: null
        };
        this.log('info', '[作业窗口] 资源已清理');
    }
}

module.exports = AssignmentWindowManager;
