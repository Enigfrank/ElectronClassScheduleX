const { dialog, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const iconv = require('iconv-lite');
const { WARNING_DURATION_MS } = require('../shared/shutdownWarning');

/**
 * 自动关机任务调度模块。
 * 每条计划拥有独立的预警窗口、计时器和取消状态，防止相邻计划互相影响。
 */
class ShutdownScheduler {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.activePlans = new Map();
        this.nextPlanSequence = 0;
    }

    /**
     * 记录关机调度日志。
     * @param {string} level 日志级别
     * @param {string} message 日志内容
     */
    log(level, message) {
        this.logger?.[level]?.(message);
    }

    /**
     * 初始化已保存的关机计划。
     */
    initialize() {
        this.log('info', '[关机调度] 初始化关机调度器');
        if (this.configManager.get('scheduleShutdown', false)) {
            this.scheduleShutdown();
        }
    }

    /**
     * 根据已保存的时间重新创建当天的关机计划。
     */
    scheduleShutdown() {
        this.log('info', '[关机调度] 开始调度关机任务');
        const storedTimes = this.configManager.getShutdownTimes();
        const validTimes = [];
        const shutdownPlans = [];

        this.clearShutdownTimers();

        storedTimes.forEach((timeItem) => {
            if (!this.isShutdownTimeItem(timeItem)) {
                this.log('error', `[关机调度] 无效计划项: ${JSON.stringify(timeItem)}`);
                return;
            }

            if (!timeItem.enabled) {
                validTimes.push(timeItem);
                return;
            }

            const targetDate = this.calculateTargetTime(timeItem.time);
            if (!targetDate) {
                this.log('warn', `[关机调度] 已过期或无效时间: ${timeItem.time}，已自动移除`);
                return;
            }

            validTimes.push(timeItem);
            const plan = this.createPlan(timeItem.time, targetDate);
            this.activePlans.set(plan.id, plan);
            this.schedulePlan(plan);
            shutdownPlans.push({
                originalTime: timeItem.time,
                formattedDate: targetDate.toLocaleString(),
                delay: targetDate - new Date()
            });
        });

        if (validTimes.length !== storedTimes.length) {
            this.configManager.setShutdownTimes(validTimes);
        }

        this.showShutdownPlans(shutdownPlans);
    }

    /**
     * 验证持久化的关机计划项。
     * @param {*} timeItem 待验证计划项
     * @returns {boolean} 是否可调度
     */
    isShutdownTimeItem(timeItem) {
        return Boolean(
            timeItem
            && typeof timeItem === 'object'
            && !Array.isArray(timeItem)
            && typeof timeItem.enabled === 'boolean'
            && this.validateTimeFormat(timeItem.time)
        );
    }

    /**
     * 验证严格的 24 小时制关机时间。
     * @param {*} timeStr 时间文本
     * @returns {boolean} 是否为 HH:mm
     */
    validateTimeFormat(timeStr) {
        return typeof timeStr === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr);
    }

    /**
     * 将今天或明天的关机时间转换为 Date。
     * @param {string} timeStr 已验证的 HH:mm 时间
     * @returns {Date|null} 目标时间
     */
    calculateTargetTime(timeStr) {
        if (!this.validateTimeFormat(timeStr)) return null;

        const [hour, minute] = timeStr.split(':').map(Number);
        const now = new Date();
        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);
        if (targetDate <= now) {
            targetDate.setDate(targetDate.getDate() + 1);
        }
        return targetDate;
    }

    /**
     * 创建独立的运行时关机计划。
     * @param {string} timeStr 计划显示时间
     * @param {Date} targetDate 目标日期
     * @returns {Object} 可调度计划
     */
    createPlan(timeStr, targetDate) {
        this.nextPlanSequence += 1;
        return {
            id: `shutdown-${Date.now()}-${this.nextPlanSequence}`,
            timeStr,
            targetDate,
            warningTimer: null,
            finalTimer: null,
            warningWindow: null,
            cancelled: false
        };
    }

    /**
     * 为单条计划安排预警和最终关机。
     * @param {Object} plan 运行时计划
     */
    schedulePlan(plan) {
        const remainingDelay = plan.targetDate - new Date();
        if (remainingDelay <= 0) {
            this.executeShutdown(plan);
            return;
        }

        const warningDelay = remainingDelay - WARNING_DURATION_MS;
        if (warningDelay > 0) {
            plan.warningTimer = setTimeout(() => {
                if (!this.isPlanActive(plan)) return;

                this.playWarningSound();
                this.showShutdownWarningWindow(plan);
                plan.finalTimer = setTimeout(() => this.executeShutdown(plan), WARNING_DURATION_MS);
            }, warningDelay);
            return;
        }

        plan.finalTimer = setTimeout(() => this.executeShutdown(plan), remainingDelay);
    }

    /**
     * 判断计划仍是当前有效计划。
     * @param {Object} plan 运行时计划
     * @returns {boolean} 是否可执行
     */
    isPlanActive(plan) {
        return this.activePlans.get(plan.id) === plan && !plan.cancelled;
    }

    /**
     * 处理预警页面针对某一计划发出的动作。
     * @param {string} planId 计划标识
     * @param {'delay30'|'delay60'|'close'} action 用户动作
     * @returns {boolean} 是否已处理
     */
    handlePlanAction(planId, action) {
        const plan = this.activePlans.get(planId);
        if (!plan || !this.isPlanActive(plan)) {
            this.log('warn', `[关机调度] 忽略已失效计划操作: ${planId}`);
            return false;
        }

        if (action === 'delay30') {
            this.handleDelayOption(plan, 30);
            return true;
        }
        if (action === 'delay60') {
            this.handleDelayOption(plan, 60);
            return true;
        }
        if (action === 'close') {
            this.cancelScheduledShutdown(plan.id);
            return true;
        }

        this.log('warn', `[关机调度] 未知计划操作: ${action}`);
        return false;
    }

    /**
     * 延后单条关机计划，不改写用户保存的每日时间设置。
     * @param {Object} plan 运行时计划
     * @param {number} delaySeconds 延后秒数
     */
    handleDelayOption(plan, delaySeconds) {
        const newTarget = new Date(plan.targetDate.getTime() + delaySeconds * 1000);
        this.log('info', `[关机调度] 计划 ${plan.id} 延后 ${delaySeconds} 秒，新时间: ${newTarget.toLocaleString()}`);

        this.clearPlanTimers(plan);
        this.closeWarningWindow(plan);
        plan.targetDate = newTarget;
        plan.timeStr = `${newTarget.getHours().toString().padStart(2, '0')}:${newTarget.getMinutes().toString().padStart(2, '0')}`;
        this.schedulePlan(plan);
    }

    /**
     * 执行单条有效计划的关机命令。
     * @param {Object} plan 运行时计划
     */
    executeShutdown(plan) {
        if (!this.isPlanActive(plan)) return;

        this.activePlans.delete(plan.id);
        this.clearPlanTimers(plan);
        this.closeWarningWindow(plan);
        this.log('info', `[关机调度] 执行关机命令，计划时间: ${plan.targetDate.toLocaleString()}`);

        exec('shutdown /s /t 0', { encoding: 'buffer' }, (error, stdout, stderr) => {
            if (error) {
                const stderrStr = stderr ? iconv.decode(stderr, 'cp936') : '';
                const errorMsg = stderrStr || error.message;
                this.log('error', `[关机调度] 关机失败 (${plan.timeStr}): ${errorMsg}`);
                dialog.showMessageBox({
                    title: '关机失败',
                    message: `计划于 ${plan.targetDate.toLocaleString()} 的关机任务失败！\n错误详情: ${errorMsg}`
                });
                return;
            }

            this.log('info', `[关机调度] 成功触发关机 (${plan.timeStr})，关机时间: ${plan.targetDate.toLocaleString()}`);
        });
    }

    /**
     * 播放系统预警提示音。
     */
    playWarningSound() {
        this.log('info', '[关机调度] 播放警告提示音');
        exec('powershell -c "[System.Media.SystemSounds]::Exclamation.Play()"', { encoding: 'buffer' }, (error, stdout, stderr) => {
            if (!error) return;
            const stderrStr = stderr ? iconv.decode(stderr, 'cp936') : '';
            this.log('warn', `[关机调度] 播放系统提示音失败: ${stderrStr || error.message}`);
        });
    }

    /**
     * 显示某条计划专属的预警窗口。
     * @param {Object} plan 运行时计划
     */
    showShutdownWarningWindow(plan) {
        this.log('info', `[关机调度] 显示计划 ${plan.id} 的关机警告窗口`);
        this.closeWarningWindow(plan);

        const warningWindow = new BrowserWindow({
            width: 380,
            height: 240,
            alwaysOnTop: true,
            frame: false,
            resizable: false,
            movable: true,
            skipTaskbar: false,
            focusable: true,
            type: 'notification',
            webPreferences: {
                preload: path.join(__dirname, '..', 'preload', 'shutdownWarningPreload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true
            }
        });

        warningWindow.setAlwaysOnTop(true, 'screen-saver');
        warningWindow.setVisibleOnAllWorkspaces(true);
        warningWindow.focus();
        plan.warningWindow = warningWindow;

        warningWindow.webContents.once('did-finish-load', () => {
            if (!warningWindow.isDestroyed()) {
                warningWindow.webContents.send('shutdown-warning-init', {
                    planId: plan.id,
                    targetTime: plan.targetDate.toLocaleString()
                });
            }
        });

        warningWindow.loadFile(path.join(__dirname, '../shutdown-warning.html')).catch((error) => {
            this.log('warn', `[关机调度] 加载关机预警页面失败: ${error.message}`);
        });

        warningWindow.on('closed', () => {
            if (plan.warningWindow === warningWindow) {
                plan.warningWindow = null;
            }
        });
    }

    /**
     * 显示本轮已创建的关机计划。
     * @param {Array<Object>} shutdownPlans 计划摘要
     */
    showShutdownPlans(shutdownPlans) {
        if (shutdownPlans.length === 0) return;

        const messageContent = shutdownPlans.map((plan, index) => (
            `• 计划 ${index + 1}:\n  原始时间: ${plan.originalTime}\n  实际触发时间: ${plan.formattedDate}\n  剩余时间: ${Math.ceil(plan.delay / 1000)} 秒`
        )).join('\n\n');
        dialog.showMessageBox({
            title: '关机计划提示',
            message: `已为您设置以下关机任务：\n\n${messageContent}`,
            buttons: ['已阅'],
            cancelId: 0
        });
        this.log('info', `[关机调度] 成功设置 ${shutdownPlans.length} 个关机计划`);
    }

    /**
     * 清除单条计划的计时器。
     * @param {Object} plan 运行时计划
     */
    clearPlanTimers(plan) {
        if (plan.warningTimer) clearTimeout(plan.warningTimer);
        if (plan.finalTimer) clearTimeout(plan.finalTimer);
        plan.warningTimer = null;
        plan.finalTimer = null;
    }

    /**
     * 清除所有计划的计时器和预警窗口。
     */
    clearShutdownTimers() {
        for (const plan of this.activePlans.values()) {
            plan.cancelled = true;
            this.clearPlanTimers(plan);
            this.closeWarningWindow(plan);
        }
        this.activePlans.clear();
    }

    /**
     * 关闭单条计划的预警窗口。
     * @param {Object} plan 运行时计划
     */
    closeWarningWindow(plan) {
        const warningWindow = plan.warningWindow;
        if (warningWindow && !warningWindow.isDestroyed()) {
            warningWindow.destroy();
        }
        plan.warningWindow = null;
    }

    /**
     * 取消单条计划，不影响其他已调度计划。
     * @param {string} planId 计划标识
     */
    cancelScheduledShutdown(planId) {
        const plan = this.activePlans.get(planId);
        if (!plan) return;

        this.log('info', `[关机调度] 取消计划 ${plan.id}`);
        plan.cancelled = true;
        this.clearPlanTimers(plan);
        this.closeWarningWindow(plan);
        this.activePlans.delete(plan.id);
    }
}

module.exports = ShutdownScheduler;
