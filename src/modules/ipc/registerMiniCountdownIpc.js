/**
 * 注册迷你倒计时与下节课提示玻璃窗口相关 IPC 通道。
 * @param {{ipcMain: Electron.IpcMain, glassWindow: Object, windowManager: Object, log: Function}} dependencies 注册依赖
 */
function registerMiniCountdownIpc({ ipcMain, glassWindow, windowManager, screen, log }) {
    /**
     * 通知当前主课表使用本地倒计时，页面重载后仍能收到故障状态。
     */
    function notifyGlassUnavailable() {
        const mainWindow = windowManager.getWindow('main');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('glass-countdown-unavailable');
        }
    }

    glassWindow.on('unavailable', notifyGlassUnavailable);

    /**
     * 判断 IPC 事件是否来自指定的玻璃窗口。
     * @param {Electron.IpcMainEvent} event IPC 事件
     * @param {Object|null} win 期望的窗口实例
     * @returns {boolean} 是否为该窗口发送
     */
    function isSenderWindow(event, win) {
        return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
    }

    /**
     * 校验玻璃窗口 renderer 上报的尺寸。
     * @param {unknown} payload 待验证数据
     * @returns {boolean} 是否为合法尺寸数据
     */
    function isValidMetrics(payload) {
        return Boolean(
            payload &&
            typeof payload === 'object' &&
            Number.isFinite(payload.width) &&
            Number.isFinite(payload.height)
        );
    }

    ipcMain.on('mini-countdown-ready', (event, metrics) => {
        if (!isSenderWindow(event, glassWindow.getWindow())) return;
        if (!isValidMetrics(metrics)) return;

        glassWindow.resizeCountdownToContent(metrics);
    });

    // 拖动只上报开始与结束，位移由主进程轮询光标得出。
    // renderer 的 pointermove 在窗口移动后会丢事件，不能作为位移来源。
    ipcMain.on('mini-countdown-drag', (event, action) => {
        if (!isSenderWindow(event, glassWindow.getWindow())) return;

        if (action === 'start') {
            glassWindow.beginDrag(screen.getCursorScreenPoint());
        } else if (action === 'end') {
            glassWindow.endDrag();
        }
        // 拖动中采样更密：采样带跟着药丸走，密度不够的话药丸落到白底后
        // 文字要再等将近一秒才变色，读起来像没反应。
        windowManager.desktopLumaSampler?.setDragging(action === 'start');
    });

    ipcMain.on('mini-countdown-hint-ready', (event, metrics) => {
        if (!isSenderWindow(event, glassWindow.getHintWindow())) return;
        if (!isValidMetrics(metrics)) return;

        glassWindow.resizeHintToContent(metrics);
    });

    // 页面在 did-finish-load 之后主动索取内容，规避补发与监听注册之间的竞态。
    ipcMain.handle('mini-countdown-pull-state', (event) => {
        if (!isSenderWindow(event, glassWindow.getWindow())) return null;
        return glassWindow.getCountdownContent();
    });

    // 页面加载完成后主动索取一次明暗判定，规避补发与监听注册之间的竞态。
    ipcMain.handle('mini-countdown-pull-background-tone', (event) => {
        if (!isSenderWindow(event, glassWindow.getWindow())) return null;
        return { lightBackground: glassWindow.getLightBackground() };
    });

    ipcMain.handle('mini-countdown-hint-pull-state', (event) => {
        if (!isSenderWindow(event, glassWindow.getHintWindow())) return null;
        const hintName = glassWindow.getHintName();
        return hintName ? { hintName } : null;
    });

    ipcMain.handle('mini-countdown-hint-pull-background-tone', (event) => {
        if (!isSenderWindow(event, glassWindow.getHintWindow())) return null;
        return { lightBackground: glassWindow.getLightBackground() };
    });

    ipcMain.on('setGlassWindowAlwaysOnTop', (event, alwaysOnTop) => {
        glassWindow.setAlwaysOnTop(Boolean(alwaysOnTop));
    });

    ipcMain.on('reset-glass-countdown-position', (event) => {
        const mainWindow = windowManager.getWindow('main');
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (event.sender !== mainWindow.webContents) return;

        glassWindow.resetPosition();
    });

    ipcMain.on('set-glass-countdown-state', (event, state) => {
        const mainWindow = windowManager.getWindow('main');
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (event.sender !== mainWindow.webContents) return;
        if (!state || typeof state !== 'object') return;

        if (glassWindow.unavailable) {
            notifyGlassUnavailable();
            return;
        }

        glassWindow.applyState(state);
    });

    log('info', '[迷你倒计时] 玻璃窗口 IPC 通道已注册');
}

module.exports = registerMiniCountdownIpc;
