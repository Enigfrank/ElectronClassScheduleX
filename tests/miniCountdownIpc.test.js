const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test, mock } = require('node:test');
const registerMiniCountdownIpc = require('../src/modules/ipc/registerMiniCountdownIpc');

/** 创建具有独立 IPC 发送端的窗口替身。 */
function createWindow() {
    return {
        destroyed: false,
        webContents: { send: mock.fn() },
        /** 返回可由测试切换的销毁状态。 */
        isDestroyed() {
            return this.destroyed;
        }
    };
}

/** 使用真实注册函数建立可观察的 IPC 事件和请求通道。 */
function createHarness() {
    const ipcMain = new EventEmitter();
    const handlers = new Map();
    ipcMain.handle = (channel, handler) => handlers.set(channel, handler);
    let mainWindow = createWindow();
    const countdown = createWindow();
    const hint = createWindow();
    const glass = new EventEmitter();
    Object.assign(glass, {
        unavailable: false,
        getWindow: () => countdown,
        getHintWindow: () => hint,
        resizeCountdownToContent: mock.fn(),
        resizeHintToContent: mock.fn(),
        beginDrag: mock.fn(),
        endDrag: mock.fn(),
        getCountdownContent: () => ({ className: '语文', countdownText: '02:30' }),
        getHintName: () => '数学',
        getLightBackground: () => true,
        resetPosition: mock.fn(),
        applyState: mock.fn(),
        setAlwaysOnTop: mock.fn()
    });
    const windowManager = {
        getWindow: () => mainWindow,
        desktopLumaSampler: { setDragging: mock.fn() }
    };
    const cursor = { x: 320, y: 120 };
    const screen = { getCursorScreenPoint: mock.fn(() => cursor) };
    registerMiniCountdownIpc({ ipcMain, glassWindow: glass, windowManager, screen, log: mock.fn() });
    return {
        ipcMain, handlers, glass, countdown, hint, windowManager, screen, cursor,
        getMainWindow: () => mainWindow,
        setMainWindow: win => { mainWindow = win; }
    };
}

test('只有各自玻璃窗口的发送端可以完成对应尺寸握手', () => {
    const { ipcMain, glass, countdown, hint, getMainWindow } = createHarness();
    const metrics = { width: 260.5, height: 100.25 };
    const cases = [
        { channel: 'mini-countdown-ready', own: countdown, other: hint, resize: glass.resizeCountdownToContent },
        { channel: 'mini-countdown-hint-ready', own: hint, other: countdown, resize: glass.resizeHintToContent }
    ];
    for (const { channel, own, other, resize } of cases) {
        for (const sender of [{}, other.webContents, getMainWindow().webContents]) {
            ipcMain.emit(channel, { sender }, metrics);
        }
        assert.equal(resize.mock.callCount(), 0);
        ipcMain.emit(channel, { sender: own.webContents }, metrics);
        assert.equal(resize.mock.callCount(), 1);
        assert.equal(resize.mock.calls[0].arguments[0], metrics);
        own.destroyed = true;
        ipcMain.emit(channel, { sender: own.webContents }, metrics);
        assert.equal(resize.mock.callCount(), 1);
    }
});

test('非法尺寸不触发握手，合法尺寸及字体就绪后的再次尺寸上报均透传', () => {
    const { ipcMain, glass, countdown, hint } = createHarness();
    for (const [channel, win, resize] of [
        ['mini-countdown-ready', countdown, glass.resizeCountdownToContent],
        ['mini-countdown-hint-ready', hint, glass.resizeHintToContent]
    ]) {
        for (const metrics of [null, undefined, {}, '260', { width: 260 },
            { width: NaN, height: 100 }, { width: 260, height: Infinity },
            { width: '260', height: 100 }]) {
            ipcMain.emit(channel, { sender: win.webContents }, metrics);
        }
        assert.equal(resize.mock.callCount(), 0);
        ipcMain.emit(channel, { sender: win.webContents }, { width: 260, height: 100 });
        ipcMain.emit(channel, { sender: win.webContents }, { width: 310, height: 100 });
        assert.equal(resize.mock.callCount(), 2);
        assert.deepEqual(resize.mock.calls[1].arguments[0], { width: 310, height: 100 });
    }
});

test('倒计时和 hint 的状态、背景请求拒绝其他窗口及已销毁发送端', () => {
    const { handlers, glass, countdown, hint, getMainWindow } = createHarness();
    const cases = [
        ['mini-countdown-pull-state', countdown, { className: '语文', countdownText: '02:30' }],
        ['mini-countdown-pull-background-tone', countdown, { lightBackground: true }],
        ['mini-countdown-hint-pull-state', hint, { hintName: '数学' }],
        ['mini-countdown-hint-pull-background-tone', hint, { lightBackground: true }]
    ];
    for (const [channel, own, expected] of cases) {
        const handler = handlers.get(channel);
        for (const sender of [{}, getMainWindow().webContents,
            own === countdown ? hint.webContents : countdown.webContents]) {
            assert.equal(handler({ sender }), null);
        }
        assert.deepEqual(handler({ sender: own.webContents }), expected);
        own.destroyed = true;
        assert.equal(handler({ sender: own.webContents }), null);
        own.destroyed = false;
    }
    glass.getCountdownContent = () => null;
    glass.getHintName = () => '';
    assert.equal(handlers.get('mini-countdown-pull-state')({ sender: countdown.webContents }), null);
    assert.equal(handlers.get('mini-countdown-hint-pull-state')({ sender: hint.webContents }), null);
});

test('拖动命令只接受倒计时发送端，并从主进程获取光标位置', () => {
    const { ipcMain, glass, countdown, hint, getMainWindow, windowManager, screen, cursor } = createHarness();
    for (const sender of [{}, hint.webContents, getMainWindow().webContents]) {
        ipcMain.emit('mini-countdown-drag', { sender }, 'start');
        ipcMain.emit('mini-countdown-drag', { sender }, 'end');
    }
    assert.equal(glass.beginDrag.mock.callCount(), 0);
    assert.equal(glass.endDrag.mock.callCount(), 0);
    assert.equal(windowManager.desktopLumaSampler.setDragging.mock.callCount(), 0);
    ipcMain.emit('mini-countdown-drag', { sender: countdown.webContents }, 'start');
    assert.equal(glass.beginDrag.mock.calls[0].arguments[0], cursor);
    assert.equal(screen.getCursorScreenPoint.mock.callCount(), 1);
    ipcMain.emit('mini-countdown-drag', { sender: countdown.webContents }, 'end');
    assert.equal(glass.endDrag.mock.callCount(), 1);
    assert.deepEqual(windowManager.desktopLumaSampler.setDragging.mock.calls.map(call => call.arguments[0]), [true, false]);
    countdown.destroyed = true;
    ipcMain.emit('mini-countdown-drag', { sender: countdown.webContents }, 'start');
    assert.equal(glass.beginDrag.mock.callCount(), 1);
});

test('只有存活主窗口可发送 state 与 reset，非法 state 不触发更新', () => {
    const { ipcMain, glass, countdown, hint, getMainWindow, setMainWindow } = createHarness();
    const main = getMainWindow();
    const state = { visible: true, className: '语文', countdownText: '00:15', topSpace: 24 };
    for (const sender of [{}, countdown.webContents, hint.webContents]) {
        ipcMain.emit('set-glass-countdown-state', { sender }, state);
        ipcMain.emit('reset-glass-countdown-position', { sender });
    }
    for (const invalid of [null, undefined, false, 'state', 1]) {
        ipcMain.emit('set-glass-countdown-state', { sender: main.webContents }, invalid);
    }
    assert.equal(glass.applyState.mock.callCount(), 0);
    assert.equal(glass.resetPosition.mock.callCount(), 0);
    ipcMain.emit('set-glass-countdown-state', { sender: main.webContents }, state);
    ipcMain.emit('reset-glass-countdown-position', { sender: main.webContents });
    assert.equal(glass.applyState.mock.calls[0].arguments[0], state);
    assert.equal(glass.resetPosition.mock.callCount(), 1);
    main.destroyed = true;
    ipcMain.emit('set-glass-countdown-state', { sender: main.webContents }, state);
    ipcMain.emit('reset-glass-countdown-position', { sender: main.webContents });
    setMainWindow(null);
    ipcMain.emit('set-glass-countdown-state', { sender: main.webContents }, state);
    ipcMain.emit('reset-glass-countdown-position', { sender: main.webContents });
    assert.equal(glass.applyState.mock.callCount(), 1);
    assert.equal(glass.resetPosition.mock.callCount(), 1);
});

test('unavailable 事件推送给当前存活主窗口', () => {
    const { glass, getMainWindow, setMainWindow } = createHarness();
    const main = getMainWindow();
    glass.unavailable = true;
    glass.emit('unavailable');
    assert.deepEqual(main.webContents.send.mock.calls[0].arguments, ['glass-countdown-unavailable']);
    main.destroyed = true;
    glass.emit('unavailable');
    setMainWindow(null);
    assert.doesNotThrow(() => glass.emit('unavailable'));
    assert.equal(main.webContents.send.mock.callCount(), 1);
});

test('故障后主页面重载再发 state 仍收到通知，且不再更新玻璃窗口', () => {
    const { ipcMain, glass, getMainWindow, setMainWindow, countdown } = createHarness();
    const main = getMainWindow();
    glass.unavailable = true;
    glass.emit('unavailable');
    assert.equal(main.webContents.send.mock.callCount(), 1);

    // 同一 BrowserWindow 的页面重载后，新监听器只能收到后续推送。
    main.webContents.send = mock.fn();
    ipcMain.emit('set-glass-countdown-state', { sender: countdown.webContents }, { visible: true });
    assert.equal(main.webContents.send.mock.callCount(), 0);
    ipcMain.emit('set-glass-countdown-state', { sender: main.webContents }, { visible: true });
    assert.deepEqual(main.webContents.send.mock.calls[0].arguments, ['glass-countdown-unavailable']);
    assert.equal(glass.applyState.mock.callCount(), 0);

    const replacement = createWindow();
    setMainWindow(replacement);
    ipcMain.emit('set-glass-countdown-state', { sender: main.webContents }, { visible: true });
    assert.equal(replacement.webContents.send.mock.callCount(), 0);
    ipcMain.emit('set-glass-countdown-state', { sender: replacement.webContents }, { visible: true });
    assert.deepEqual(replacement.webContents.send.mock.calls[0].arguments, ['glass-countdown-unavailable']);
    assert.equal(glass.applyState.mock.callCount(), 0);
});

test('applyState 内部首次故障会立即通知主窗口并在后续 state 时再次通知', () => {
    const { ipcMain, glass, getMainWindow } = createHarness();
    const main = getMainWindow();
    glass.applyState.mock.mockImplementation(() => {
        glass.unavailable = true;
        glass.emit('unavailable');
    });
    ipcMain.emit('set-glass-countdown-state', { sender: main.webContents }, { visible: true });
    assert.equal(main.webContents.send.mock.callCount(), 1);
    ipcMain.emit('set-glass-countdown-state', { sender: main.webContents }, { visible: true });
    assert.equal(main.webContents.send.mock.callCount(), 2);
    assert.equal(glass.applyState.mock.callCount(), 1);
});
