/**
 * 注册定时关机相关 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, configManager: Object, shutdownScheduler: Object, log: Function}} dependencies 注册依赖
 */
function registerShutdownIpc({ ipcMain, configManager, shutdownScheduler, log }) {
    ipcMain.handle('getShutdownTimes', () => configManager.getShutdownTimes());

    /**
     * 验证并规范化来自 renderer 的新增关机计划。
     * @param {*} timeItem 未验证 IPC 输入
     * @returns {{time: string, enabled: boolean}|null} 合法计划或 null
     */
    function normalizeTimeItem(timeItem) {
        if (!shutdownScheduler?.isShutdownTimeItem?.(timeItem)) {
            return null;
        }

        return {
            time: timeItem.time.trim(),
            enabled: timeItem.enabled
        };
    }

    ipcMain.on('addShutdownTime', (event, timeItem) => {
        const normalizedTimeItem = normalizeTimeItem(timeItem);
        if (!normalizedTimeItem) {
            log('warn', `[关机管理] 拒绝无效关机时间: ${JSON.stringify(timeItem)}`);
            return;
        }

        const times = configManager.getShutdownTimes();
        times.push(normalizedTimeItem);
        configManager.setShutdownTimes(times);
        shutdownScheduler.scheduleShutdown();
        event.sender.send('shutdownTimesUpdated', times);
    });

    ipcMain.on('deleteShutdownTime', (event, index) => {
        const times = configManager.getShutdownTimes();
        if (!Number.isInteger(index) || index < 0 || index >= times.length) {
            log('warn', `[关机管理] 拒绝无效计划索引: ${index}`);
            return;
        }

        times.splice(index, 1);
        configManager.setShutdownTimes(times);
        shutdownScheduler.scheduleShutdown();
        event.sender.send('shutdownTimesUpdated', times);
    });

    ipcMain.on('toggleShutdownTime', (event, index) => {
        const times = configManager.getShutdownTimes();
        if (Number.isInteger(index) && times[index] && typeof times[index].enabled === 'boolean') {
            times[index].enabled = !times[index].enabled;
            configManager.setShutdownTimes(times);
            shutdownScheduler.scheduleShutdown();
            event.sender.send('shutdownTimesUpdated', times);
        }
    });

    ipcMain.on('shutdown-action', (event, payload) => {
        if (!shutdownScheduler) return log('error', '[关机管理] 关机调度器未初始化');

        const planId = typeof payload?.planId === 'string' ? payload.planId : '';
        const action = typeof payload?.action === 'string' ? payload.action : '';
        if (!planId || !['delay30', 'delay60', 'close'].includes(action)) {
            log('warn', `[关机管理] 拒绝无效关机操作: ${JSON.stringify(payload)}`);
            return;
        }

        if (shutdownScheduler.handlePlanAction(planId, action)) {
            log('info', `[关机管理] 关机操作已执行: ${action}`);
        } else {
            log('warn', `[关机管理] 操作被忽略: ${action} (${planId})`);
        }
    });
}

module.exports = registerShutdownIpc;
