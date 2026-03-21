const { dialog, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const iconv = require('iconv-lite');

/**
 * 自动关机任务调度模块
 * 负责定时关机任务的设置、警告显示、延迟处理及最终关机指令的发送
 */
class ShutdownScheduler {
    /**
     * @param {ConfigManager} configManager - 配置管理器实例
     * @param {Object} logger - 日志记录器实例
     */
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.shutdownTasks = new Map();
        this.currentShutdownWarningWindow = null;
        this.currentWarningTaskId = null;
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
     * 根据配置文件中的关机设置开始调度关机任务
     */
    scheduleShutdown() {
        this.log('info', '[关机调度] 开始调度关机任务');
        const storedTimes = this.configManager.getShutdownTimes();
        const currentTimes = [...storedTimes];
        const shutdownPlans = [];

        this.clearShutdownTimers();

        currentTimes.forEach((timeItem, index) => {
            if (!timeItem.enabled) {
                return;
            }

            const timeStr = timeItem.time;
            if (!this.validateTimeFormat(timeStr)) {
                this.log('error', `[关机调度] 无效时间格式: ${timeStr}`);
                return;
            }

            const targetDate = this.calculateTargetTime(timeStr);
            if (!targetDate) {
                this.log('warn', `[关机调度] 已过期时间: ${timeStr}，已自动移除`);
                currentTimes.splice(index, 1);
                return;
            }

            const delay = targetDate - new Date();
            this.scheduleShutdownWithWarning(timeStr, targetDate);

            shutdownPlans.push({
                originalTime: timeStr,
                formattedDate: targetDate.toLocaleString(),
                delay: delay
            });
        });

        if (currentTimes.length !== storedTimes.length) {
            this.configManager.setShutdownTimes(currentTimes);
        }

        this.showShutdownPlans(shutdownPlans);
    }

    /**
     * 验证时间字符串格式是否为 HH:MM
     * @param {string} timeStr - 待验证的时间字符串
     * @returns {boolean} 是否符合格式
     */
    validateTimeFormat(timeStr) {
        const timeParts = timeStr.match(/^(\d{2}):(\d{2})$/);
        return !!timeParts;
    }

    /**
     * 根据 HH:MM 格式的时间字符串计算下一次触发的日期对象
     * @param {string} timeStr - 时间字符串
     * @returns {Date|null} 目标日期对象，无效格式则返回 null
     */
    calculateTargetTime(timeStr) {
        const timeParts = timeStr.match(/^(\d{2}):(\d{2})$/);
        if (!timeParts) return null;

        const [_, hour, minute] = timeParts;
        const now = new Date();
        let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

        if (targetDate <= now) {
            targetDate.setDate(targetDate.getDate() + 1);
        }

        return targetDate;
    }

    /**
     * 调度带预警提醒的关机任务
     * 在关机前 15 秒弹出警告窗口
     * @param {string} timeStr - 原始设定的时间
     * @param {Date} targetDate - 目标关机时间
     */
    scheduleShutdownWithWarning(timeStr, targetDate) {
        const now = new Date();
        const remainingDelay = targetDate - now;
        const taskId = `${timeStr}-${targetDate.getTime()}`;

        if (remainingDelay <= 0) {
            this.executeShutdown(taskId, timeStr, targetDate);
            return;
        }

        const warningDelay = remainingDelay - 15 * 1000;
        const taskState = {
            timeStr,
            targetDate,
            warningTimerId: null,
            finalTimerId: null
        };
        this.shutdownTasks.set(taskId, taskState);

        if (warningDelay > 0) {
            const warningTimerId = setTimeout(() => {
                this.playWarningSound();
                this.showShutdownWarningWindow(taskId, timeStr, targetDate,
                    () => this.handleDelayOption(taskId, targetDate, 30),
                    () => this.handleDelayOption(taskId, targetDate, 60),
                    () => this.cancelScheduledShutdown(taskId),
                );

                const finalTimerId = setTimeout(() => {
                    this.executeShutdown(taskId, timeStr, targetDate);
                }, 15 * 1000);

                const currentTask = this.shutdownTasks.get(taskId);
                if (currentTask) {
                    currentTask.finalTimerId = finalTimerId;
                }
            }, warningDelay);

            taskState.warningTimerId = warningTimerId;
        } else {
            taskState.finalTimerId = setTimeout(() => this.executeShutdown(taskId, timeStr, targetDate), remainingDelay);
        }
    }

    /**
     * 处理关机预警中的延迟选项
     * @param {string} taskId - 当前关机任务ID
     * @param {Date} currentTargetDate - 当前关机目标时间
     * @param {number} delaySeconds - 需要延迟的秒数
     */
    handleDelayOption(taskId, currentTargetDate, delaySeconds) {
        const newTarget = new Date(currentTargetDate.getTime() + delaySeconds * 1000);
        this.log('info', `[关机调度] 用户选择延长${delaySeconds}秒关机，新关机时间: ${newTarget.toLocaleString()}`);

        this.clearTaskTimers(taskId);

        const timeStr = `${newTarget.getHours().toString().padStart(2, '0')}:${newTarget.getMinutes().toString().padStart(2, '0')}`;
        this.scheduleShutdownWithWarning(timeStr, newTarget);
    }

    /**
     * 执行最终的系统关机指令
     * @param {string} taskId - 当前关机任务ID
     * @param {string} originalTime - 原始设定的触发时间字符串
     * @param {Date} targetDate - 实际执行关机的目标日期
     */
    executeShutdown(taskId, originalTime, targetDate) {
        this.closeWarningWindow(taskId);
        this.clearTaskTimers(taskId);

        this.log('info', `[关机调度] 执行关机命令，计划时间: ${targetDate.toLocaleString()}`);
        exec('shutdown /s /t 0', { encoding: 'buffer' }, (error, stdout, stderr) => {
            if (error) {
                const stderrStr = stderr ? iconv.decode(stderr, 'cp936') : '';
                const errorMsg = stderrStr || error.message;

                this.log('error', `[关机调度] 关机失败 (${originalTime}): ${errorMsg}`);
                dialog.showMessageBox({
                    title: '关机失败',
                    message: `计划于 ${targetDate.toLocaleString()} 的关机任务失败！\n错误详情: ${errorMsg}`
                });
            } else {
                this.log('info', `[关机调度] 成功触发关机 (${originalTime})，关机时间: ${targetDate.toLocaleString()}`);
            }
        });
    }

    /**
     * 播放系统提示音进行预警
     */
    playWarningSound() {
        this.log('info', '[关机调度] 播放警告提示音');
        exec('powershell -c "[System.Media.SystemSounds]::Exclamation.Play()"', { encoding: 'buffer' }, (err, stdout, stderr) => {
            if (err) {
                const stderrStr = stderr ? iconv.decode(stderr, 'cp936') : '';
                this.log('warn', `[关机调度] 播放系统提示音失败: ${stderrStr || err.message}`);
            }
        });
    }

    /**
     * 显示关机前的倒计时确认/预警弹窗
     * @param {string} timeStr - 关机时间
     * @param {Date} targetDate - 目标时间对象
     * @param {Function} onDelay30 - 延迟 30 秒的回调
     * @param {Function} onDelay60 - 延迟 60 秒的回调
     * @param {Function} onClose - 取消/关闭的回调
     */
    showShutdownWarningWindow(taskId, timeStr, targetDate, onDelay30, onDelay60, onClose) {
        this.log('info', `[关机调度] 显示关机警告窗口，目标时间: ${targetDate.toLocaleString()}`);
        this.closeWarningWindow();

        const shutdownWarningWin = new BrowserWindow({
            width: 360,
            height: 220,
            alwaysOnTop: true,
            frame: false,
            resizable: false,
            movable: true,
            skipTaskbar: false,
            focusable: true,
            type: 'notification',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            }
        });

        shutdownWarningWin.setAlwaysOnTop(true, 'screen-saver');
        shutdownWarningWin.setVisibleOnAllWorkspaces(true);
        shutdownWarningWin.focus();

        this.currentShutdownWarningWindow = shutdownWarningWin;
        this.currentWarningTaskId = taskId;
        const htmlPath = path.join(__dirname, '../shutdown-warning.html');
        shutdownWarningWin.loadFile(htmlPath);

        shutdownWarningWin.webContents.on('did-finish-load', () => {
            const targetTimeStr = targetDate.toLocaleString();
            shutdownWarningWin.webContents.executeJavaScript(`
                window.shutdownTargetTime = "${targetTimeStr}";
                const targetTimeEl = document.getElementById('targetTime');
                if (targetTimeEl) {
                    targetTimeEl.textContent = window.shutdownTargetTime;
                }
            `).catch(err => {
                this.log('warn', `[关机调度] 设置目标时间失败: ${err.message}`);
            });
        });

        this.currentCallbacks = {
            onDelay30: onDelay30,
            onDelay60: onDelay60,
            onClose: onClose
        };

        shutdownWarningWin.on('closed', () => {
            this.currentShutdownWarningWindow = null;
            this.currentCallbacks = null;
            this.currentWarningTaskId = null;
        });
    }

    /**
     * 关闭当前显示的关机预警窗口
     * @param {string|null} taskId - 需要关闭的关机任务ID，为 null 时表示直接关闭当前窗口
     */
    closeWarningWindow(taskId = null) {
        const shouldCloseCurrentWindow = taskId === null || this.currentWarningTaskId === taskId;
        if (shouldCloseCurrentWindow && this.currentShutdownWarningWindow && !this.currentShutdownWarningWindow.isDestroyed()) {
            this.currentShutdownWarningWindow.close();
        }
    }

    /**
     * 计算并弹窗显示所有的关机任务详情
     * @param {Array} shutdownPlans - 包含关机计划详情的数组
     */
    showShutdownPlans(shutdownPlans) {
        if (shutdownPlans.length > 0) {
            const messageContent = shutdownPlans.map((plan, index) =>
                `• 计划 ${index + 1}:\n` +
                `  原始时间: ${plan.originalTime}\n` +
                `  实际触发时间: ${plan.formattedDate}\n` +
                `  剩余时间: ${Math.ceil(plan.delay / 1000)} 秒`
            ).join('\n\n');

            dialog.showMessageBox({
                title: '关机计划提示',
                message: `已为您设置以下关机任务：\n\n${messageContent}`,
                buttons: ['知道了'],
                cancelId: 0
            });

            this.log('info', `[关机调度] 成功设置 ${shutdownPlans.length} 个关机计划`);
            shutdownPlans.forEach((plan, index) => {
                this.log('info', `[关机调度] [${index + 1}] 原始时间: ${plan.originalTime} | 触发时间: ${plan.formattedDate} | 剩余 ${Math.ceil(plan.delay / 1000)} 秒`);
            });
        } else {
            dialog.showMessageBox({
                title: '温馨提示',
                message: '当前没有设置有效的关机任务',
                type: 'info'
            });
        }
    }

    /**
     * 清除所有的关机相关的定时器
     */
    clearShutdownTimers() {
        Array.from(this.shutdownTasks.keys()).forEach(taskId => this.clearTaskTimers(taskId));
    }

    /**
     * 清除指定关机任务的定时器
     * @param {string} taskId - 关机任务ID
     */
    clearTaskTimers(taskId) {
        const taskState = this.shutdownTasks.get(taskId);
        if (!taskState) {
            return;
        }

        if (taskState.warningTimerId) {
            clearTimeout(taskState.warningTimerId);
        }

        if (taskState.finalTimerId) {
            clearTimeout(taskState.finalTimerId);
        }

        this.shutdownTasks.delete(taskId);
    }

    /**
     * 取消所有已排期的关机任务
     * @param {string|null} taskId - 关机任务ID，为 null 时表示取消全部
     */
    cancelScheduledShutdown(taskId = null) {
        this.log('info', taskId ? `[关机调度] 取消指定定时关机: ${taskId}` : '[关机调度] 取消定时关机');

        if (taskId) {
            this.clearTaskTimers(taskId);
            this.closeWarningWindow(taskId);
        } else {
            this.clearShutdownTimers();
            this.closeWarningWindow();
        }

        dialog.showMessageBox({
            title: '关机取消',
            message: taskId ? '已取消当前定时关机任务' : '已取消定时关机'
        });
    }

    /**
     * 初始化调度器，启动已在配置中启用的关机任务
     */
    initialize() {
        this.log('info', '[关机调度] 初始化关机调度器');
        const isScheduled = this.configManager.get('scheduleShutdown', false);
        if (isScheduled) {
            this.scheduleShutdown();
        }
    }
}

module.exports = ShutdownScheduler;