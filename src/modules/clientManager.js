const WebSocket = require('ws');
const axios = require('axios');
const { Notification } = require('electron');

/**
 * 客户端管理模块
 * 负责WebSocket连接管理、HTTP API封装、系统通知等功能
 * 配置由 AssignmentConfigManager 统一管理
 */
class ClientManager {
    /**
     * 构造函数
     * @param {AssignmentConfigManager} assignmentConfigManager - 作业配置管理器实例
     * @param {Object} logger - 日志记录器实例
     */
    constructor(assignmentConfigManager, logger = null) {
        this.assignmentConfigManager = assignmentConfigManager;
        this.logger = logger;
        this.ws = null;
        this.reconnectTimer = null;
        this.reconnectInterval = 10000;
        this.isEnabled = false;

        this.callbacks = {
            onNewAssignment: null,
            onAssignmentCancelled: null,
            onWsStatus: null
        };
    }

    /**
     * 记录日志
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     */
    log(level, message) {
        if (this.logger) {
            this.logger[level](`[客户端管理] ${message}`);
        }
    }

    /**
     * 获取配置项
     * @param {string} key - 配置键名
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    get(key, defaultValue = null) {
        return this.assignmentConfigManager.get(key, defaultValue);
    }

    /**
     * 设置配置项
     * @param {string} key - 配置键名
     * @param {*} value - 配置值
     */
    set(key, value) {
        this.assignmentConfigManager.set(key, value);
        this.log('info', `设置 ${key} = ${JSON.stringify(value)}`);
    }

    /**
     * 获取所有配置
     * @returns {Object} 配置对象
     */
    getAll() {
        return this.assignmentConfigManager.getAll();
    }

    /**
     * 更新多个配置项
     * @param {Object} newConfig - 新配置对象
     */
    updateConfig(newConfig) {
        this.assignmentConfigManager.updateConfig(newConfig);
        this.log('info', '配置已更新');
    }

    /**
     * 获取WebSocket当前状态
     * @returns {string} WebSocket状态
     */
    getWsStatus() {
        if (!this.ws) return 'disconnected';
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING: return 'connecting';
            case WebSocket.OPEN: return 'connected';
            case WebSocket.CLOSING: return 'disconnected';
            case WebSocket.CLOSED: return 'disconnected';
            default: return 'disconnected';
        }
    }

    /**
     * 连接WebSocket
     */
    connect() {
        this.isEnabled = true;

        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.on('error', () => { });
            try {
                if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.terminate();
                }
            } catch (err) {
                this.log('error', `关闭旧WebSocket失败: ${err.message}`);
            }
            this.ws = null;
        }

        const clientId = this.assignmentConfigManager.getClientId();
        if (!clientId) {
            this.log('info', '未注册客户端，跳过WebSocket连接');
            return;
        }

        this.clearReconnectTimer();
        this.triggerWsStatusCallback('connecting');

        const wsURL = this.assignmentConfigManager.getWsURL();

        try {
            this.ws = new WebSocket(wsURL);

            this.ws.on('open', () => {
                this.log('info', 'WebSocket连接成功');
                this.ws.send(JSON.stringify({
                    type: 'register',
                    client_id: clientId
                }));
                this.triggerWsStatusCallback('connected');
            });

            this.ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleWebSocketMessage(message);
                } catch (err) {
                    this.log('error', `解析WebSocket消息失败: ${err.message}`);
                }
            });

            this.ws.on('close', () => {
                this.log('info', 'WebSocket连接关闭');
                this.triggerWsStatusCallback('disconnected');
                this.scheduleReconnect();
            });

            this.ws.on('error', (err) => {
                this.log('error', `WebSocket错误: ${err.message}`);
                this.triggerWsStatusCallback('error');
            });
        } catch (err) {
            this.log('error', `创建WebSocket连接失败: ${err.message}`);
            this.scheduleReconnect();
        }
    }

    /**
     * 断开WebSocket连接并禁用自动重连
     */
    disconnect() {
        this.isEnabled = false;
        this.clearReconnectTimer();

        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.on('error', () => { });
            try {
                if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.terminate();
                }
            } catch (err) {
                this.log('error', `断开WebSocket失败: ${err.message}`);
            }
            this.ws = null;
        }
        this.triggerWsStatusCallback('disconnected');
        this.log('info', 'WebSocket已断开');
    }

    /**
     * 安排自动重连
     */
    scheduleReconnect() {
        if (!this.isEnabled) return;
        this.clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
            if (this.isEnabled) {
                this.log('info', '尝试重新连接WebSocket...');
                this.connect();
            }
        }, this.reconnectInterval);
    }

    /**
     * 清除重连定时器
     */
    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * 处理WebSocket消息
     * @param {Object} message - 消息对象
     */
    handleWebSocketMessage(message) {
        this.log('info', `收到消息: ${JSON.stringify(message)}`);

        switch (message.type) {
            case 'new_assignment':
                this.showNotification('新作业', `${message.data.subject} - ${message.data.title}`);
                if (this.callbacks.onNewAssignment) {
                    this.callbacks.onNewAssignment(message.data);
                }
                break;

            case 'assignment_cancelled':
                if (this.callbacks.onAssignmentCancelled) {
                    this.callbacks.onAssignmentCancelled(message.data);
                }
                break;

            case 'registered':
                this.log('info', 'WebSocket注册成功');
                break;

            case 'heartbeat':
                break;

            default:
                this.log('info', `未知消息类型: ${message.type}`);
        }
    }

    /**
     * 显示系统通知
     * @param {string} title - 通知标题
     * @param {string} body - 通知内容
     */
    showNotification(title, body) {
        if (Notification.isSupported()) {
            const notification = new Notification({ title, body });
            notification.on('click', () => {
                notification.close();
            });
            notification.show();
            this.log('info', `显示通知: ${title} - ${body}`);
        }
    }

    /**
     * 触发WebSocket状态回调
     * @param {string} status - 状态字符串
     */
    triggerWsStatusCallback(status) {
        if (this.callbacks.onWsStatus) {
            this.callbacks.onWsStatus(status);
        }
    }

    /**
     * 设置新作业回调
     * @param {Function} callback - 回调函数
     */
    setOnNewAssignment(callback) {
        this.callbacks.onNewAssignment = callback;
    }

    /**
     * 设置作业取消回调
     * @param {Function} callback - 回调函数
     */
    setOnAssignmentCancelled(callback) {
        this.callbacks.onAssignmentCancelled = callback;
    }

    /**
     * 设置WebSocket状态回调
     * @param {Function} callback - 回调函数
     */
    setOnWsStatus(callback) {
        this.callbacks.onWsStatus = callback;
    }

    /**
     * 注册客户端
     * @param {Object} data - 注册数据
     * @returns {Promise<Object>} 注册结果
     */
    async registerClient(data) {
        try {
            const serverURL = this.assignmentConfigManager.getServerURL();
            const response = await axios.post(`${serverURL}/api/client/register`, data);
            const result = response.data;

            if (result.client_id) {
                this.assignmentConfigManager.setClientId(result.client_id);
                this.assignmentConfigManager.setClientName(data.name || '');
                this.log('info', `客户端注册成功: ${result.client_id}`);
            }

            return result;
        } catch (err) {
            this.log('error', `注册客户端失败: ${err.message}`);
            throw err;
        }
    }

    /**
     * 获取作业列表
     * @param {string} clientId - 客户端ID
     * @param {string} status - 作业状态（可选）
     * @returns {Promise<Object>} 作业列表
     */
    async getAssignments(clientId, status = null) {
        try {
            const serverURL = this.assignmentConfigManager.getServerURL();
            const url = `${serverURL}/api/client/assignments/${clientId}${status ? `?status=${status}` : ''}`;
            const response = await axios.get(url);
            return response.data;
        } catch (err) {
            this.log('error', `获取作业列表失败: ${err.message}`);
            throw err;
        }
    }

    /**
     * 标记作业为已读
     * @param {string} assignmentId - 作业ID
     * @param {string} clientId - 客户端ID
     * @returns {Promise<Object>} 操作结果
     */
    async markRead(assignmentId, clientId) {
        try {
            const serverURL = this.assignmentConfigManager.getServerURL();
            const response = await axios.post(
                `${serverURL}/api/client/assignments/${assignmentId}/read`,
                { client_id: clientId }
            );
            return response.data;
        } catch (err) {
            this.log('error', `标记已读失败: ${err.message}`);
            throw err;
        }
    }

    /**
     * 确认收到作业
     * @param {string} assignmentId - 作业ID
     * @param {string} clientId - 客户端ID
     * @returns {Promise<Object>} 操作结果
     */
    async acknowledge(assignmentId, clientId) {
        try {
            const serverURL = this.assignmentConfigManager.getServerURL();
            const response = await axios.post(
                `${serverURL}/api/client/assignments/${assignmentId}/acknowledge`,
                { client_id: clientId }
            );
            return response.data;
        } catch (err) {
            this.log('error', `确认作业失败: ${err.message}`);
            throw err;
        }
    }

    /**
     * 获取未读作业数量
     * @param {string} clientId - 客户端ID
     * @returns {Promise<Object>} 未读数量信息
     */
    async getUnreadCount(clientId) {
        try {
            const serverURL = this.assignmentConfigManager.getServerURL();
            const response = await axios.get(`${serverURL}/api/client/unread-count/${clientId}`);
            return response.data;
        } catch (err) {
            this.log('error', `获取未读数量失败: ${err.message}`);
            throw err;
        }
    }

    /**
     * 测试服务器连接
     * @param {string} serverURL - 服务器地址
     * @returns {Promise<Object>} 测试结果
     */
    async testConnection(serverURL) {
        try {
            const response = await axios.get(`${serverURL}/api/health`, { timeout: 5000 });
            return response.data;
        } catch (err) {
            this.log('error', `测试连接失败: ${err.message}`);
            throw err;
        }
    }

    /**
     * 销毁实例，清理资源
     */
    destroy() {
        this.disconnect();
        this.callbacks = {
            onNewAssignment: null,
            onAssignmentCancelled: null,
            onWsStatus: null
        };
        this.log('info', '客户端管理器已销毁');
    }
}

module.exports = ClientManager;
