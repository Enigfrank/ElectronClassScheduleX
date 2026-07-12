/**
 * 注册定时关机相关 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, configManager: Object, shutdownScheduler: Object, log: Function}} dependencies 注册依赖
 */
function registerShutdownIpc({ ipcMain, configManager, shutdownScheduler, log }) {
    ipcMain.handle('getShutdownTimes', () => configManager.getShutdownTimes());

    ipcMain.on('addShutdownTime', (event, timeItem) => {
        const times = configManager.getShutdownTimes();
        times.push(timeItem);
        configManager.setShutdownTimes(times);
        shutdownScheduler.scheduleShutdown();
        event.sender.send('shutdownTimesUpdated', times);
    });

    ipcMain.on('deleteShutdownTime', (event, index) => {
        const times = configManager.getShutdownTimes();
        times.splice(index, 1);
        configManager.setShutdownTimes(times);
        shutdownScheduler.scheduleShutdown();
        event.sender.send('shutdownTimesUpdated', times);
    });

    ipcMain.on('toggleShutdownTime', (event, index) => {
        const times = configManager.getShutdownTimes();
        if (times[index]) {
            times[index].enabled = !times[index].enabled;
            configManager.setShutdownTimes(times);
            shutdownScheduler.scheduleShutdown();
            event.sender.send('shutdownTimesUpdated', times);
        }
    });

    ipcMain.on('shutdown-action', (event, action) => {
        if (!shutdownScheduler) return log('error', '[关机管理] 关机调度器未初始化');

        const methodMap = { delay30: 'onDelay30', delay60: 'onDelay60', close: 'onClose' };
        const methodName = methodMap[action];
        if (!methodName) {
            return log('warn', `[关机管理] 未知的关机操作指令: ${action}`);
        }

        const callback = shutdownScheduler.currentCallbacks?.[methodName];
        if (typeof callback === 'function') {
            callback();
            log('info', `[关机管理] 关机操作已执行: ${action}`);
        } else {
            log('warn', `[关机管理] 操作被忽略: ${action}`);
        }
    });
}

module.exports = registerShutdownIpc;
