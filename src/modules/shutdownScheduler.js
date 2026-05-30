const { dialog, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const iconv = require('iconv-lite');

/**
 * 自动关机任务调度模块
 * 负责定时关机任务的设置、警告显示、延迟处理及最终关机指令的发送
 */
class ShutdownScheduler {
    constructor(configManager, logger) {
        this.configManager = configManager;
        this.logger = logger;
        
        this.shutdownTimers = []; 
        this.currentFinalTimer = null;
        this.currentShutdownWarningWindow = null;
        this.shutdownCancelled = false;
        this.currentCallbacks = null;
    }

    log(level, message) {
        this.logger?.[level]?.(message);
    }

    initialize() {
        this.log('info', '[关机调度] 初始化关机调度器');
        const isScheduled = this.configManager.get('scheduleShutdown', false);
        if (isScheduled) this.scheduleShutdown();
    }

    scheduleShutdown() {
        this.log('info', '[关机调度] 开始调度关机任务');
        const storedTimes = this.configManager.getShutdownTimes();
        const validTimes = [];
        const shutdownPlans = [];

        this.clearShutdownTimers();

        storedTimes.forEach((timeItem) => {
            if (!timeItem.enabled) {
                validTimes.push(timeItem); // 保留未启用的项
                return;
            }

            const timeStr = timeItem.time;
            if (!this.validateTimeFormat(timeStr)) {
                this.log('error', `[关机调度] 无效时间格式: ${timeStr}`);
                return; // 过滤掉无效格式
            }

            const targetDate = this.calculateTargetTime(timeStr);
            if (!targetDate) {
                this.log('warn', `[关机调度] 已过期时间: ${timeStr}，已自动移除`);
                return; // 过滤掉已过期时间，不加入 validTimes
            }

            validTimes.push(timeItem); // 保留有效时间

            const delay = targetDate - new Date();
            this.scheduleShutdownWithWarning(timeStr, targetDate);

            shutdownPlans.push({
                originalTime: timeStr,
                formattedDate: targetDate.toLocaleString(),
                delay: delay
            });
        });

        // 只有当有效时间数量发生变化时，才更新配置
        if (validTimes.length !== storedTimes.length) {
            this.configManager.setShutdownTimes(validTimes);
        }

        this.showShutdownPlans(shutdownPlans);
    }

    validateTimeFormat(timeStr) {
        return /^(\d{2}):(\d{2})$/.test(timeStr);
    }

    calculateTargetTime(timeStr) {
        const timeParts = timeStr.match(/^(\d{2}):(\d{2})$/);
        if (!timeParts) return null;

        const [, hour, minute] = timeParts;
        const now = new Date();
        let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

        if (targetDate <= now) {
            targetDate.setDate(targetDate.getDate() + 1);
        }

        return targetDate;
    }

    scheduleShutdownWithWarning(timeStr, targetDate) {
        this.shutdownCancelled = false;
        const now = new Date();
        const remainingDelay = targetDate - now;

        if (remainingDelay <= 0) {
            this.executeShutdown(timeStr, targetDate);
            return;
        }

        const warningDelay = remainingDelay - 15 * 1000;

        if (warningDelay > 0) {
            const warningTimerId = setTimeout(() => {
                if (this.shutdownCancelled) return;

                this.playWarningSound();
                this.showShutdownWarningWindow(timeStr, targetDate,
                    () => this.handleDelayOption(targetDate, 30),
                    () => this.handleDelayOption(targetDate, 60),
                    () => this.cancelScheduledShutdown()
                );

                this.currentFinalTimer = setTimeout(() => {
                    if (this.shutdownCancelled) return;
                    this.executeShutdown(timeStr, targetDate);
                }, 15 * 1000);
                
            }, warningDelay);

            this.shutdownTimers.push(warningTimerId);
        } else {
            // 如果剩余时间不足 15 秒，直接设置 finalTimer
            this.currentFinalTimer = setTimeout(() => {
                if (this.shutdownCancelled) return;
                this.executeShutdown(timeStr, targetDate);
            }, remainingDelay);
        }
    }

    /**
     * 处理关机预警中的延迟选项
     * @param {Date} currentTargetDate - 当前关机目标时间
     * @param {number} delaySeconds - 需要延迟的秒数
     */
    handleDelayOption(currentTargetDate, delaySeconds) {
        const newTarget = new Date(currentTargetDate.getTime() + delaySeconds * 1000);
        this.log('info', `[关机调度] 用户选择延长${delaySeconds}秒关机，新关机时间: ${newTarget.toLocaleString()}`);

        this.closeWarningWindow();

        // 清除原本最后 15 秒的关机定时器
        if (this.currentFinalTimer) {
            clearTimeout(this.currentFinalTimer);
            this.currentFinalTimer = null;
        }

        // 重新生成时间字符串并再次进入调度流程
        const timeStr = `${newTarget.getHours().toString().padStart(2, '0')}:${newTarget.getMinutes().toString().padStart(2, '0')}`;
        this.scheduleShutdownWithWarning(timeStr, newTarget);
    }

    executeShutdown(originalTime, targetDate) {
        this.closeWarningWindow();
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

    playWarningSound() {
        this.log('info', '[关机调度] 播放警告提示音');
        exec('powershell -c "[System.Media.SystemSounds]::Exclamation.Play()"', { encoding: 'buffer' }, (err, stdout, stderr) => {
            if (err) {
                const stderrStr = stderr ? iconv.decode(stderr, 'cp936') : '';
                this.log('warn', `[关机调度] 播放系统提示音失败: ${stderrStr || err.message}`);
            }
        });
    }

    showShutdownWarningWindow(timeStr, targetDate, onDelay30, onDelay60, onClose) {
        this.log('info', `[关机调度] 显示关机警告窗口，目标时间: ${targetDate.toLocaleString()}`);
        this.closeWarningWindow();

        const shutdownWarningWin = new BrowserWindow({
            width: 380, height: 240, alwaysOnTop: true, frame: false, resizable: false,
            movable: true, skipTaskbar: false, focusable: true, type: 'notification',
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        shutdownWarningWin.setAlwaysOnTop(true, 'screen-saver');
        shutdownWarningWin.setVisibleOnAllWorkspaces(true);
        shutdownWarningWin.focus();

        this.currentShutdownWarningWindow = shutdownWarningWin;
        this.currentCallbacks = { onDelay30, onDelay60, onClose };

        const htmlPath = path.join(__dirname, '../shutdown-warning.html');
        shutdownWarningWin.loadFile(htmlPath);

        shutdownWarningWin.webContents.on('did-finish-load', () => {
            const targetTimeStr = targetDate.toLocaleString();
            shutdownWarningWin.webContents.executeJavaScript(`
                window.shutdownTargetTime = "${targetTimeStr}";
                const targetTimeEl = document.getElementById('targetTime');
                if (targetTimeEl) targetTimeEl.textContent = window.shutdownTargetTime;
            `).catch(err => this.log('warn', `[关机调度] 设置目标时间失败: ${err.message}`));
        });

        shutdownWarningWin.on('closed', () => {
            this.currentShutdownWarningWindow = null;
            this.currentCallbacks = null;
        });
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
        }
    }

    clearShutdownTimers() {
        this.shutdownTimers.forEach(timerId => clearTimeout(timerId));
        this.shutdownTimers.length = 0;
        
        // 同时清理可能存在的 finalTimer
        if (this.currentFinalTimer) {
            clearTimeout(this.currentFinalTimer);
            this.currentFinalTimer = null;
        }
    }

    closeWarningWindow() {
        if (this.currentShutdownWarningWindow && !this.currentShutdownWarningWindow.isDestroyed()) {
            this.currentShutdownWarningWindow.destroy();
        }
        // 状态清理已移至 'closed' 事件中，此处无需重复
    }

    cancelScheduledShutdown() {
        this.log('info', '[关机调度] 取消定时关机');
        this.shutdownCancelled = true;
        this.clearShutdownTimers();
        this.closeWarningWindow();
    }
}

module.exports = ShutdownScheduler;