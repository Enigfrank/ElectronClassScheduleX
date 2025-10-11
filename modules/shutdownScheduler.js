const { dialog, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const path = require('path');

class ShutdownScheduler {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        this.shutdownTimers = [];
        this.currentShutdownWarningWindow = null;
    }

    // 调度关机任务
    scheduleShutdown() {
        const storedTimes = this.configManager.getShutdownTimes();
        const currentTimes = [...storedTimes];
        const shutdownPlans = [];

        // 清除之前的定时器
        this.clearShutdownTimers();

        currentTimes.forEach((timeItem, index) => {
            // 只调度启用的时间
            if (!timeItem.enabled) {
                return;
            }

            const timeStr = timeItem.time;
            if (!this.validateTimeFormat(timeStr)) {
                this.logger.error(`无效时间格式: ${timeStr}`);
                return;
            }

            const targetDate = this.calculateTargetTime(timeStr);
            if (!targetDate) {
                this.logger.warn(`已过期时间: ${timeStr}，已自动移除`);
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

        // 更新存储
        if (currentTimes.length !== storedTimes.length) {
            this.configManager.setShutdownTimes(currentTimes);
        }

        // 显示关机计划提示
        this.showShutdownPlans(shutdownPlans);
    }

    // 验证时间格式
    validateTimeFormat(timeStr) {
        const timeParts = timeStr.match(/^(\d{2}):(\d{2})$/);
        return !!timeParts;
    }

    // 计算目标时间
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

    // 带警告的关机调度
    scheduleShutdownWithWarning(timeStr, targetDate) {
        const now = new Date();
        const remainingDelay = targetDate - now;

        if (remainingDelay <= 0) {
            this.executeShutdown(timeStr, targetDate);
            return;
        }

        const warningDelay = remainingDelay - 15 * 1000;
        let finalShutdownTimer = null;

        if (warningDelay > 0) {
            const warningTimerId = setTimeout(() => {
                this.playWarningSound();
                this.showShutdownWarningWindow(timeStr, targetDate, 
                    () => this.handleDelayOption(targetDate, 30),
                    () => this.handleDelayOption(targetDate, 60),
                    () => this.logger.info('用户选择关闭提示，继续执行关机流程')
                );

                finalShutdownTimer = setTimeout(() => {
                    this.executeShutdown(timeStr, targetDate);
                }, 15 * 1000);

                this.shutdownTimers.push(finalShutdownTimer);
            }, warningDelay);

            this.shutdownTimers.push(warningTimerId);
        } else {
            const finalTimerId = setTimeout(() => this.executeShutdown(timeStr, targetDate), remainingDelay);
            this.shutdownTimers.push(finalTimerId);
        }
    }

    // 处理延迟选项
    handleDelayOption(currentTargetDate, delaySeconds) {
        const newTarget = new Date(currentTargetDate.getTime() + delaySeconds * 1000);
        this.logger.info(`用户选择延长${delaySeconds}秒关机，新关机时间: ${newTarget.toLocaleString()}`);
        
        // 清除之前的定时器
        this.clearShutdownTimers();
        
        // 使用格式化的时间字符串而不是null
        const timeStr = `${newTarget.getHours().toString().padStart(2, '0')}:${newTarget.getMinutes().toString().padStart(2, '0')}`;
        this.scheduleShutdownWithWarning(timeStr, newTarget);
    }

    // 执行关机
    executeShutdown(originalTime, targetDate) {
        this.closeWarningWindow();

        exec('shutdown /s /t 0', (error) => {
            if (error) {
                this.logger.error(`关机失败 (${originalTime}): ${error.message}`);
                dialog.showMessageBox({
                    title: '关机失败',
                    message: `计划于 ${targetDate.toLocaleString()} 的关机任务失败！\n错误详情: ${error.message}`
                });
            } else {
                this.logger.info(`成功触发关机 (${originalTime})，关机时间: ${targetDate.toLocaleString()}`);
            }
        });
    }

    // 播放警告声音
    playWarningSound() {
        exec('powershell -c "[System.Media.SystemSounds]::Exclamation.Play()"', (err) => {
            if (err) this.logger.warn('播放系统提示音失败:', err.message);
        });
    }

    // 显示关机警告窗口
    showShutdownWarningWindow(timeStr, targetDate, onDelay30, onDelay60, onClose) {
        this.closeWarningWindow();

        const shutdownWarningWin = new BrowserWindow({
            width: 360,
            height: 220,
            alwaysOnTop: true,
            frame: false,
            resizable: false,
            movable: true,
            skipTaskbar: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            }
        });

        this.currentShutdownWarningWindow = shutdownWarningWin;
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
                this.logger.warn('设置目标时间失败:', err.message);
            });
        });

        // 将回调函数存储在调度器中，而不是窗口对象上
        this.currentCallbacks = {
            onDelay30: onDelay30,
            onDelay60: onDelay60,
            onClose: onClose
        };

        shutdownWarningWin.on('closed', () => {
            this.currentShutdownWarningWindow = null;
            this.currentCallbacks = null;
        });
    }

    // 关闭警告窗口
    closeWarningWindow() {
        if (this.currentShutdownWarningWindow && !this.currentShutdownWarningWindow.isDestroyed()) {
            this.currentShutdownWarningWindow.close();
        }
    }

    // 显示关机计划
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

            this.logger.info(`成功设置 ${shutdownPlans.length} 个关机计划`);
            shutdownPlans.forEach((plan, index) => {
                this.logger.info(`[${index + 1}] 原始时间: ${plan.originalTime} | 触发时间: ${plan.formattedDate} | 剩余 ${Math.ceil(plan.delay / 1000)} 秒`);
            });
        } else {
            dialog.showMessageBox({
                title: '温馨提示',
                message: '当前没有设置有效的关机任务',
                type: 'info'
            });
        }
    }

    // 清除关机定时器
    clearShutdownTimers() {
        this.shutdownTimers.forEach(timerId => clearTimeout(timerId));
        this.shutdownTimers.length = 0;
    }

    // 取消定时关机
    cancelScheduledShutdown() {
        this.clearShutdownTimers();
        this.closeWarningWindow();
        this.logger.info('Scheduled shutdown canceled');
        dialog.showMessageBox({
            title: '关机取消',
            message: '已取消定时关机'
        });
    }

    // 初始化关机调度
    initialize() {
        const isScheduled = this.configManager.get('scheduleShutdown', false);
        if (isScheduled) {
            this.scheduleShutdown();
        }
    }
}

module.exports = ShutdownScheduler;