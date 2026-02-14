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

    log(level, message) {
        if (this.logger) {
            this.logger[level](message);
        }
    }

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

    validateTimeFormat(timeStr) {
        const timeParts = timeStr.match(/^(\d{2}):(\d{2})$/);
        return !!timeParts;
    }

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
                    () => this.cancelScheduledShutdown(),
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

    handleDelayOption(currentTargetDate, delaySeconds) {
        const newTarget = new Date(currentTargetDate.getTime() + delaySeconds * 1000);
        this.log('info', `[关机调度] 用户选择延长${delaySeconds}秒关机，新关机时间: ${newTarget.toLocaleString()}`);
        
        this.clearShutdownTimers();
        
        const timeStr = `${newTarget.getHours().toString().padStart(2, '0')}:${newTarget.getMinutes().toString().padStart(2, '0')}`;
        this.scheduleShutdownWithWarning(timeStr, newTarget);
    }

    executeShutdown(originalTime, targetDate) {
        this.closeWarningWindow();

        this.log('info', `[关机调度] 执行关机命令，计划时间: ${targetDate.toLocaleString()}`);
        exec('shutdown /s /t 0', (error) => {
            if (error) {
                this.log('error', `[关机调度] 关机失败 (${originalTime}): ${error.message}`);
                dialog.showMessageBox({
                    title: '关机失败',
                    message: `计划于 ${targetDate.toLocaleString()} 的关机任务失败！\n错误详情: ${error.message}`
                });
            } else {
                this.log('info', `[关机调度] 成功触发关机 (${originalTime})，关机时间: ${targetDate.toLocaleString()}`);
            }
        });
    }

    playWarningSound() {
        this.log('info', '[关机调度] 播放警告提示音');
        exec('powershell -c "[System.Media.SystemSounds]::Exclamation.Play()"', (err) => {
            if (err) this.log('warn', `[关机调度] 播放系统提示音失败: ${err.message}`);
        });
    }

    showShutdownWarningWindow(timeStr, targetDate, onDelay30, onDelay60, onClose) {
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
        });
    }

    closeWarningWindow() {
        if (this.currentShutdownWarningWindow && !this.currentShutdownWarningWindow.isDestroyed()) {
            this.currentShutdownWarningWindow.close();
        }
    }

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

    clearShutdownTimers() {
        this.shutdownTimers.forEach(timerId => clearTimeout(timerId));
        this.shutdownTimers.length = 0;
    }

    cancelScheduledShutdown() {
        this.log('info', '[关机调度] 取消定时关机');
        this.clearShutdownTimers();
        this.closeWarningWindow();
        dialog.showMessageBox({
            title: '关机取消',
            message: '已取消定时关机'
        });
    }

    initialize() {
        this.log('info', '[关机调度] 初始化关机调度器');
        const isScheduled = this.configManager.get('scheduleShutdown', false);
        if (isScheduled) {
            this.scheduleShutdown();
        }
    }
}

module.exports = ShutdownScheduler;