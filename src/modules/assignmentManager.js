/**
 * 作业管理器
 * 负责作业窗口的显示检查逻辑和与客户端管理器的事件对接
 */
class AssignmentManager {
    /**
     * 构造函数
     * @param {AssignmentConfigManager} assignmentConfigManager - 作业配置管理器实例
     * @param {ClientManager} clientManager - 客户端管理器实例
     * @param {AssignmentWindowManager} assignmentWindowManager - 作业窗口管理器实例
     * @param {IpcManager} ipcManager - IPC管理器实例
     * @param {Logger} logger - 日志管理器实例
     */
    constructor(assignmentConfigManager, clientManager, assignmentWindowManager, ipcManager, logger) {
        this.assignmentConfigManager = assignmentConfigManager;
        this.clientManager = clientManager;
        this.assignmentWindowManager = assignmentWindowManager;
        this.ipcManager = ipcManager;
        this.logger = logger;
        
        this.pendingAssignments = null;
        this.assignmentCheckInterval = null;
    }

    /**
     * 初始化作业管理器
     */
    initialize() {
        this.setupClientManagerCallbacks();
        this.startAssignmentCheckTimer();
        
        // 如果作业功能已启用且有clientId, 自动连接WebSocket
        if (this.assignmentConfigManager.getAssignmentEnabled() && this.assignmentConfigManager.getClientId()) {
            this.clientManager.connect();
            this.log('info', '作业功能已启用, 自动连接WebSocket');
        }
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](`[作业管理] ${message}`);
        }
    }

    /**
     * 检查并显示作业窗口
     * 根据配置的显示条件判断是否应该显示作业窗口
     */
    checkAndShowAssignmentWindow() {
        if (!this.assignmentWindowManager || !this.assignmentConfigManager) {
            return;
        }

        const displayPeriod = this.assignmentConfigManager.getAssignmentDisplayPeriod();

        // 检查是否满足显示条件
        if (typeof displayPeriod === 'string' && displayPeriod.startsWith('time:')) {
            const timeStr = displayPeriod.replace('time:', '');
            const [targetHour, targetMinute] = timeStr.split(':').map(Number);
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();

            // 如果当前时间已超过目标时间, 且有缓存的作业
            if ((currentHour > targetHour || (currentHour === targetHour && currentMinute >= targetMinute))
                && this.pendingAssignments) {
                this.log('info', `满足显示条件 (${timeStr}), 显示作业窗口`);
                this.assignmentWindowManager.showWindow(this.pendingAssignments);
                this.pendingAssignments = null;
            }
        } else if (displayPeriod === -1 && this.pendingAssignments) {
            // 放学后显示模式, 暂时缓存作业
            this.log('info', '放学后显示模式, 作业已缓存');
        }
    }

    /**
     * 启动作业窗口显示检查定时器
     */
    startAssignmentCheckTimer() {
        if (this.assignmentCheckInterval) {
            clearInterval(this.assignmentCheckInterval);
        }

        // 每分钟检查一次
        this.assignmentCheckInterval = setInterval(() => this.checkAndShowAssignmentWindow(), 60000);

        // 立即执行一次检查
        this.checkAndShowAssignmentWindow();

        this.log('info', '作业窗口显示检查定时器已启动');
    }

    /**
     * 设置 clientManager 的事件回调
     */
    setupClientManagerCallbacks() {
        if (!this.clientManager || !this.assignmentWindowManager || !this.ipcManager) {
            this.log('warn', '无法设置 clientManager 回调：模块未初始化');
            return;
        }

        // 设置新作业回调
        this.clientManager.setOnNewAssignment((data) => {
            this.log('info', '收到新作业通知: ' + JSON.stringify(data));
            // 获取作业列表
            const clientId = this.assignmentConfigManager.getClientId();
            if (clientId) {
                this.clientManager.getAssignments(clientId).then(assignments => {
                    // 缓存作业数据
                    this.pendingAssignments = assignments;
                    // 检查是否应该立即显示
                    if (this.assignmentWindowManager.shouldShowWindow()) {
                        this.assignmentWindowManager.showWindow(assignments);
                        this.pendingAssignments = null;
                    } else {
                        this.log('info', '作业已缓存, 等待满足显示条件');
                    }
                }).catch(err => {
                    this.log('error', '获取作业列表失败: ' + err.message);
                });
            }
            // 显示系统通知
            if (this.clientManager && this.clientManager.showNotification) {
                this.clientManager.showNotification('新作业', `收到新作业: ${data.title || '点击查看详情'}`);
            }
        });

        // 设置作业取消回调
        this.clientManager.setOnAssignmentCancelled((data) => {
            this.log('info', '收到作业取消通知: ' + JSON.stringify(data));
            // 重新获取作业列表并更新窗口
            const clientId = this.assignmentConfigManager.getClientId();
            if (clientId) {
                this.clientManager.getAssignments(clientId).then(assignments => {
                    // 更新缓存
                    this.pendingAssignments = assignments;
                    // 如果窗口已显示, 直接更新
                    if (this.assignmentWindowManager.isWindowVisible()) {
                        this.assignmentWindowManager.updateAssignments(assignments);
                    }
                }).catch(err => {
                    this.log('error', '获取作业列表失败: ' + err.message);
                });
            }
        });

        // 设置WebSocket状态回调
        this.clientManager.setOnWsStatus((status) => {
            this.ipcManager.sendWsStatusToRenderer(status);
        });

        this.log('info', 'clientManager 事件回调设置完成');
    }

    /**
     * 清理资源
     */
    destroy() {
        if (this.assignmentCheckInterval) {
            clearInterval(this.assignmentCheckInterval);
            this.assignmentCheckInterval = null;
        }
        this.log('info', '作业管理器已清理');
    }
}

module.exports = AssignmentManager;
