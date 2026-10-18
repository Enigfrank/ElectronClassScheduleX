const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, mock } = require('node:test');

const modulePath = path.join(__dirname, '..', 'src', 'modules', 'miniCountdownGlassWindow.js');
const source = fs.readFileSync(modulePath, 'utf8');

/** 创建可手动推进的计时器，避免生命周期测试等待真实超时。 */
function createTimers() {
    let now = 0;
    const pending = new Map();

    /** 注册一次性或轮询计时器，返回支持 unref 的句柄。 */
    function schedule(callback, delay, interval = false) {
        const handle = { unref: mock.fn() };
        pending.set(handle, { callback, time: now + delay, delay, interval });
        return handle;
    }

    return {
        pending,
        setTimeout: (callback, delay) => schedule(callback, delay),
        clearTimeout: handle => pending.delete(handle),
        setInterval: (callback, delay) => schedule(callback, delay, true),
        clearInterval: handle => pending.delete(handle),
        /** 按触发时间执行区间内的所有计时器。 */
        advance(milliseconds) {
            const end = now + milliseconds;
            for (;;) {
                const next = [...pending].filter(([, timer]) => timer.time <= end)
                    .sort((a, b) => a[1].time - b[1].time)[0];
                if (!next) break;
                const [handle, timer] = next;
                now = timer.time;
                if (timer.interval) timer.time += timer.delay;
                else pending.delete(handle);
                timer.callback();
            }
            now = end;
        }
    };
}

/**
 * 在 VM 中加载真实玻璃窗口模块，隔离 Electron、屏幕与计时器。
 * @param {{constructorFailsAt?: number, loadRejectsAt?: number, deferLoads?: boolean, workArea?: Object}} options 故障和屏幕参数
 * @returns {Object} 真实控制器及可观测替身
 */
function createHarness(options = {}) {
    const timers = createTimers();
    const windows = [];
    let constructorAttempts = 0;
    const workArea = options.workArea || { x: 100, y: 80, width: 1000, height: 700 };
    const display = { workArea, bounds: { ...workArea } };

    class FakeBrowserWindow extends EventEmitter {
        /** 创建隐藏窗口并安装可观测的显示和 IPC 方法。 */
        constructor(windowOptions) {
            super();
            constructorAttempts += 1;
            if (constructorAttempts === options.constructorFailsAt) throw new Error('constructor failed');
            this.options = windowOptions;
            this.bounds = {
                x: windowOptions.x, y: windowOptions.y,
                width: windowOptions.width, height: windowOptions.height
            };
            this.visible = false;
            this.destroyed = false;
            this.loading = true;
            this.webContents = new EventEmitter();
            this.webContents.isLoading = () => this.loading;
            this.webContents.send = mock.fn();
            this.showInactive = mock.fn(() => { this.visible = true; });
            this.hide = mock.fn(() => { this.visible = false; });
            this.setAlwaysOnTop = mock.fn();
            this.moveTop = mock.fn();
            this.rejectLoad = windows.length + 1 === options.loadRejectsAt;
            windows.push(this);
        }

        /** 模拟导航成功或拒绝；加载完成事件由测试显式触发。 */
        loadFile() {
            if (options.deferLoads) {
                return new Promise((resolve, reject) => { this.pendingLoad = { resolve, reject }; });
            }
            return this.rejectLoad ? Promise.reject(new Error('load rejected')) : Promise.resolve();
        }

        /** 完成页面导航，触发实际模块的缓存补发。 */
        finishLoad() {
            this.loading = false;
            this.webContents.emit('did-finish-load');
        }

        /** 返回窗口销毁状态。 */
        isDestroyed() {
            return this.destroyed;
        }

        /** 返回窗口可见状态。 */
        isVisible() {
            return this.visible;
        }

        /** 返回窗口边界的独立副本。 */
        getBounds() {
            return { ...this.bounds };
        }

        /** 更新窗口边界并通知位置跟随逻辑。 */
        setBounds(bounds) {
            this.bounds = { ...bounds };
            this.emit('move');
        }

        /** 移动窗口并通知位置跟随逻辑。 */
        setPosition(x, y) {
            this.bounds = { ...this.bounds, x, y };
            this.emit('move');
        }

        /** 销毁窗口并运行生产模块的关闭监听。 */
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.visible = false;
            this.emit('closed');
        }
    }

    const electron = {
        BrowserWindow: FakeBrowserWindow,
        screen: {
            getPrimaryDisplay: () => display,
            getDisplayMatching: () => display,
            getCursorScreenPoint: () => ({ x: 500, y: 100 })
        }
    };
    const moduleStub = { exports: {} };
    vm.runInNewContext(source, {
        module: moduleStub,
        require: name => name === 'electron' ? electron : require(name),
        __dirname: path.dirname(modulePath),
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        setInterval: timers.setInterval,
        clearInterval: timers.clearInterval
    }, { filename: modulePath });
    const logger = { error: mock.fn(), warn: mock.fn(), info: mock.fn() };
    const glass = new moduleStub.exports({ getWindowAlwaysOnTop: () => true }, logger);
    const unavailable = mock.fn();
    glass.on('unavailable', unavailable);
    return {
        glass, windows, timers, workArea, display, unavailable,
        getConstructorAttempts: () => constructorAttempts
    };
}

/** 发送包含两个可见表面的状态，可按测试场景覆盖字段。 */
function applyVisibleState(glass, overrides = {}) {
    glass.applyState({
        visible: true, className: '语文', countdownText: '02:30',
        hintVisible: true, hintName: '数学', ...overrides
    });
}

/** 模拟两个页面完成加载并上报首个有效尺寸。 */
function readyBoth(glass) {
    glass.getWindow().finishLoad();
    glass.getHintWindow().finishLoad();
    glass.resizeCountdownToContent({ width: 260, height: 100 });
    glass.resizeHintToContent({ width: 220, height: 100 });
}

/** 验证故障会隐藏两个表面、只通知一次，并阻止任何后续重建。 */
function assertUnavailable(harness) {
    const { glass, windows, timers, unavailable, getConstructorAttempts } = harness;
    assert.equal(glass.unavailable, true);
    assert.equal(unavailable.mock.callCount(), 1);
    assert.ok(windows.every(win => !win.isVisible()));
    assert.equal(timers.pending.size, 0);
    const attempts = getConstructorAttempts();
    applyVisibleState(glass);
    glass.resizeCountdownToContent({ width: 300, height: 100 });
    glass.resizeHintToContent({ width: 240, height: 100 });
    glass.setSuppressed(false);
    assert.equal(glass.create(), null);
    assert.equal(glass.createHint(), null);
    assert.equal(getConstructorAttempts(), attempts);
    assert.ok(windows.every(win => !win.isVisible()));
    glass.markUnavailable(new Error('second failure'));
    assert.equal(unavailable.mock.callCount(), 1);
}

test('抑制期间 state、尺寸 ready 和页面加载不重显，解除后恢复最新内容', () => {
    const { glass } = createHarness();
    applyVisibleState(glass);
    readyBoth(glass);
    const countdown = glass.getWindow();
    const hint = glass.getHintWindow();
    assert.equal(countdown.isVisible(), true);
    assert.equal(hint.isVisible(), true);

    glass.setSuppressed(true);
    const countdownShows = countdown.showInactive.mock.callCount();
    const hintShows = hint.showInactive.mock.callCount();
    applyVisibleState(glass, { className: '英语', countdownText: '00:42', hintName: '物理' });
    glass.resizeCountdownToContent({ width: 310, height: 100 });
    glass.resizeHintToContent({ width: 240, height: 100 });
    countdown.finishLoad();
    hint.finishLoad();
    assert.equal(countdown.isVisible(), false);
    assert.equal(hint.isVisible(), false);
    assert.equal(countdown.showInactive.mock.callCount(), countdownShows);
    assert.equal(hint.showInactive.mock.callCount(), hintShows);
    assert.deepEqual({ ...glass.getCountdownContent() }, { className: '英语', countdownText: '00:42' });
    assert.equal(glass.getHintName(), '物理');
    const contentCall = countdown.webContents.send.mock.calls
        .filter(call => call.arguments[0] === 'mini-countdown-state').at(-1);
    assert.deepEqual({ ...contentCall.arguments[1] }, { className: '英语', countdownText: '00:42' });

    glass.setSuppressed(false);
    assert.equal(countdown.isVisible(), true);
    assert.equal(hint.isVisible(), true);
});

for (const state of [
    { visible: false, hintVisible: true },
    { visible: true, hintVisible: false },
    { visible: false, hintVisible: false }
]) {
    test(`抑制解除按最新可见性恢复 countdown=${state.visible}, hint=${state.hintVisible}`, () => {
        const { glass } = createHarness();
        applyVisibleState(glass);
        readyBoth(glass);
        glass.setSuppressed(true);
        applyVisibleState(glass, state);
        glass.resizeHintToContent({ width: 230, height: 100 });
        glass.setSuppressed(false);
        assert.equal(glass.getWindow().isVisible(), state.visible);
        assert.equal(glass.getHintWindow().isVisible(), state.hintVisible);
    });
}

test('抑制先于首次创建时，两窗口首次 ready 仍保持隐藏', () => {
    const { glass } = createHarness();
    glass.setSuppressed(true);
    applyVisibleState(glass);
    readyBoth(glass);
    assert.equal(glass.getWindow().showInactive.mock.callCount(), 0);
    assert.equal(glass.getHintWindow().showInactive.mock.callCount(), 0);
    glass.setSuppressed(false);
    assert.equal(glass.getWindow().isVisible(), true);
    assert.equal(glass.getHintWindow().isVisible(), true);
});

test('已撤销的 hint 收到迟到加载和 ready 后不会复活', () => {
    const { glass } = createHarness();
    applyVisibleState(glass);
    const hint = glass.getHintWindow();
    glass.setSuppressed(true);
    applyVisibleState(glass, { hintVisible: false, hintName: '' });
    hint.finishLoad();
    glass.resizeHintToContent({ width: 220, height: 100 });
    glass.setSuppressed(false);
    assert.equal(glass.getHintName(), '');
    assert.equal(hint.isVisible(), false);
    assert.equal(hint.showInactive.mock.callCount(), 0);
    assert.equal(hint.webContents.send.mock.callCount(), 0);
});

test('hint ready 后反复更新状态和尺寸保持可见，不重建窗口或留下新 timer', () => {
    const { glass, windows, timers, unavailable } = createHarness();
    applyVisibleState(glass);
    readyBoth(glass);
    const hint = glass.getHintWindow();
    const showCount = hint.showInactive.mock.callCount();
    const names = ['英语', '物理', '化学'];
    for (const [index, hintName] of names.entries()) {
        applyVisibleState(glass, { visible: false, hintName });
        assert.equal(hint.isVisible(), true);
        glass.resizeHintToContent({ width: 230 + index * 10, height: 100 });
        assert.equal(hint.isVisible(), true);
        assert.equal(glass.getHintWindow(), hint);
        assert.equal(glass.getHintName(), hintName);
        assert.equal(timers.pending.size, 0);
    }
    const sentNames = hint.webContents.send.mock.calls
        .filter(call => call.arguments[0] === 'mini-countdown-hint-state')
        .map(call => call.arguments[1].hintName);
    assert.deepEqual(sentNames.slice(-3), names);
    assert.equal(hint.showInactive.mock.callCount(), showCount);
    assert.equal(windows.length, 2);
    timers.advance(20000);
    assert.equal(unavailable.mock.callCount(), 0);
});

test('topSpace 在首次 applyState 创建、reset、clamp 及 hint 顶部位置均使用指定像素', () => {
    const { glass, workArea, display } = createHarness();
    applyVisibleState(glass, { topSpace: 24 });
    const countdown = glass.getWindow();
    const hint = glass.getHintWindow();
    assert.equal(countdown.getBounds().y + 34 - workArea.y, 24);
    glass.resizeCountdownToContent({ width: 260, height: 100 });
    glass.resizeHintToContent({ width: 220, height: 100 });
    assert.equal(hint.getBounds().y + 34 - workArea.y, 24);

    countdown.setPosition(workArea.x, workArea.y + 300);
    assert.equal(hint.getBounds().y + 34 - workArea.y, 24);
    glass.resetPosition();
    assert.equal(countdown.getBounds().y + 34 - workArea.y, 24);
    const clamped = glass.clampBounds({ x: 400, y: -1000, width: 260, height: 100 }, display);
    assert.equal(clamped.y + 34 - workArea.y, 24);

    applyVisibleState(glass, { topSpace: 48 });
    assert.equal(countdown.getBounds().y + 34 - workArea.y, 48);
    assert.equal(hint.getBounds().y + 34 - workArea.y, 48);
    assert.equal(glass.clampBounds({ x: 400, y: -1000, width: 260, height: 100 }, display).y + 34 - workArea.y, 48);
});

test('非法 topSpace 保留上一次有效像素值且不重置拖动位置', () => {
    const { glass } = createHarness();
    applyVisibleState(glass, { topSpace: 32 });
    const countdown = glass.getWindow();
    countdown.setPosition(200, 300);
    for (const topSpace of [undefined, null, NaN, Infinity, -Infinity, '24px', '24', {}]) {
        applyVisibleState(glass, { topSpace });
        assert.equal(glass.topSpace, 32);
        assert.equal(countdown.getBounds().x, 200);
        assert.equal(countdown.getBounds().y, 300);
    }
});

test('右侧候选超界时 hint 回顶部居中，恰好贴边仍并排', () => {
    const { glass, workArea } = createHarness({ workArea: { x: 200, y: 100, width: 500, height: 600 } });
    applyVisibleState(glass, { topSpace: 28 });
    glass.resizeCountdownToContent({ width: 260, height: 100 });
    glass.resizeHintToContent({ width: 220, height: 100 });
    const countdown = glass.getWindow();
    const hint = glass.getHintWindow();
    const top = workArea.y + 28 - 34;

    // 278 + 260 - 34 + 10 - 34 = 480，提示右边界恰为工作区右边界 700。
    countdown.setPosition(278, top);
    assert.equal(hint.getBounds().x, 480);
    assert.equal(hint.getBounds().x + hint.getBounds().width, workArea.x + workArea.width);
    countdown.setPosition(279, top);
    assert.equal(hint.getBounds().x, 340);
    assert.equal(hint.getBounds().y, top);
});

for (const constructorFailsAt of [1, 2]) {
    test(`第 ${constructorFailsAt} 个窗口构造失败触发不可用并阻止重建`, () => {
        const harness = createHarness({ constructorFailsAt });
        applyVisibleState(harness.glass);
        assert.equal(harness.windows.length, constructorFailsAt - 1);
        assertUnavailable(harness);
    });
}

for (const loadRejectsAt of [1, 2]) {
    test(`第 ${loadRejectsAt} 个窗口 loadFile 拒绝后隐藏两个窗口并停用`, async () => {
        const harness = createHarness({ loadRejectsAt });
        applyVisibleState(harness.glass);
        readyBoth(harness.glass);
        assert.ok(harness.windows.every(win => win.isVisible()));
        await Promise.resolve();
        assertUnavailable(harness);
    });
}

for (const windowIndex of [0, 1]) {
    test(`第 ${windowIndex + 1} 个 renderer 崩溃后隐藏两个窗口并停用`, () => {
        const harness = createHarness();
        applyVisibleState(harness.glass);
        readyBoth(harness.glass);
        harness.windows[windowIndex].webContents.emit('render-process-gone', {}, { reason: 'crashed' });
        assertUnavailable(harness);
    });

    test(`第 ${windowIndex + 1} 个窗口首次 ready 超时触发不可用并隐藏另一窗口`, () => {
        const harness = createHarness();
        const { glass, timers } = harness;
        applyVisibleState(glass);
        if (windowIndex === 0) glass.resizeHintToContent({ width: 220, height: 100 });
        else glass.resizeCountdownToContent({ width: 260, height: 100 });
        timers.advance(9999);
        assert.equal(glass.unavailable, false);
        assert.equal(harness.windows[1 - windowIndex].isVisible(), true);
        timers.advance(1);
        assertUnavailable(harness);
    });
}

test('主 frame 加载失败触发不可用，子 frame 加载失败不触发', () => {
    const harness = createHarness();
    applyVisibleState(harness.glass);
    readyBoth(harness.glass);
    const webContents = harness.glass.getHintWindow().webContents;
    webContents.emit('did-fail-load', {}, -3, 'subframe aborted', 'about:blank', false);
    assert.equal(harness.glass.unavailable, false);
    webContents.emit('did-fail-load', {}, -2, 'main frame failed', 'file://hint', true);
    assertUnavailable(harness);
});

test('首次有效尺寸握手清除 ready timer，导航完成和非法尺寸不算 ready', () => {
    const { glass, timers, unavailable } = createHarness();
    applyVisibleState(glass);
    glass.getWindow().finishLoad();
    glass.getHintWindow().finishLoad();
    glass.resizeCountdownToContent({ width: NaN, height: 100 });
    glass.resizeHintToContent({ width: 220, height: Infinity });
    assert.equal(timers.pending.size, 2);
    assert.equal(glass.getWindow().isVisible(), false);
    assert.equal(glass.getHintWindow().isVisible(), false);
    timers.advance(9999);
    glass.resizeCountdownToContent({ width: 260, height: 100 });
    glass.resizeHintToContent({ width: 220, height: 100 });
    assert.equal(timers.pending.size, 0);
    timers.advance(20000);
    assert.equal(unavailable.mock.callCount(), 0);
    assert.equal(glass.getWindow().isVisible(), true);
    assert.equal(glass.getHintWindow().isVisible(), true);
});

test('主动 destroy 清除 ready timer 并关闭两窗口，不触发故障回退或重建', () => {
    const { glass, windows, timers, unavailable, getConstructorAttempts } = createHarness();
    applyVisibleState(glass);
    assert.equal(timers.pending.size, 2);
    glass.destroy();
    timers.advance(20000);
    assert.equal(timers.pending.size, 0);
    assert.ok(windows.every(win => win.isDestroyed()));
    assert.equal(unavailable.mock.callCount(), 0);
    assert.equal(glass.unavailable, false);
    applyVisibleState(glass);
    assert.equal(glass.create(), null);
    assert.equal(glass.createHint(), null);
    assert.equal(getConstructorAttempts(), 2);
});

test('destroy 后迟到加载、尺寸、崩溃和 Promise 拒绝均不发送状态或触发 fallback', async () => {
    const { glass, windows, timers, unavailable, getConstructorAttempts } = createHarness({ deferLoads: true });
    applyVisibleState(glass);
    glass.setLightBackground(true);
    glass.destroy();
    for (const win of windows) {
        win.finishLoad();
        win.webContents.emit('did-fail-load', {}, -2, 'late failure', 'file://late', true);
        win.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
        win.pendingLoad.reject(new Error('late load rejection'));
    }
    glass.resizeCountdownToContent({ width: 260, height: 100 });
    glass.resizeHintToContent({ width: 220, height: 100 });
    glass.setSuppressed(false);
    await Promise.resolve();
    timers.advance(20000);
    assert.equal(unavailable.mock.callCount(), 0);
    assert.equal(timers.pending.size, 0);
    assert.equal(glass.readyWindows.size, 0);
    assert.equal(getConstructorAttempts(), 2);
    for (const win of windows) {
        assert.equal(win.webContents.send.mock.callCount(), 0);
        assert.equal(win.showInactive.mock.callCount(), 0);
    }
});

for (const [index, channel] of [[0, 'mini-countdown-state'], [1, 'mini-countdown-hint-state']]) {
    test(`unavailable 后迟到的第 ${index + 1} 个页面加载不能补发缓存 state`, () => {
        const { glass, windows, timers } = createHarness();
        applyVisibleState(glass);
        glass.markUnavailable(new Error('first ready failed'));
        windows[index].finishLoad();
        const stateCalls = windows[index].webContents.send.mock.calls
            .filter(call => call.arguments[0] === channel);
        assert.equal(stateCalls.length, 0, '故障窗口仍收到缓存 state');
        assert.equal(windows[index].isVisible(), false);
        assert.equal(timers.pending.size, 0);
    });
}

test('整体可见性只在变化时通知，暂停、故障和销毁均停用采样', () => {
    for (const finish of ['suppress', 'fail', 'destroy']) {
        const { glass } = createHarness();
        const visibility = [];
        glass.on('visibility-changed', visible => visibility.push(visible));
        applyVisibleState(glass);
        assert.deepEqual(visibility, []);
        readyBoth(glass);
        applyVisibleState(glass);
        glass.setVisible(true);
        assert.deepEqual(visibility, [true]);
        if (finish === 'suppress') glass.setSuppressed(true);
        if (finish === 'fail') glass.markUnavailable(new Error('failed'));
        if (finish === 'destroy') glass.destroy();
        assert.deepEqual(visibility, [true, false]);
        glass.setVisible(false);
        assert.deepEqual(visibility, [true, false]);
    }
});

test('仅提示可见时继续采样，两个表面都收起时停止', () => {
    const { glass } = createHarness();
    const visibility = [];
    glass.on('visibility-changed', visible => visibility.push(visible));
    applyVisibleState(glass);
    readyBoth(glass);
    applyVisibleState(glass, { visible: false });
    assert.deepEqual(visibility, [true]);
    applyVisibleState(glass, { visible: false, hintVisible: false, hintName: '' });
    assert.deepEqual(visibility, [true, false]);
});

test('提示名称不变时不重复发消息，隐藏后相同内容无需重新上报尺寸即可显示', () => {
    const { glass } = createHarness();
    applyVisibleState(glass);
    readyBoth(glass);
    const hint = glass.getHintWindow();
    const originalCalls = hint.webContents.send.mock.callCount();
    for (let index = 0; index < 10; index++) applyVisibleState(glass);
    assert.equal(hint.webContents.send.mock.callCount(), originalCalls);
    applyVisibleState(glass, { hintVisible: false, hintName: '' });
    assert.equal(hint.isVisible(), false);
    applyVisibleState(glass);
    assert.equal(hint.isVisible(), true);
    assert.equal(glass.hintSize.width, 220);
    assert.equal(hint.webContents.send.mock.callCount(), originalCalls + 1);
});

test('归位坐标相同时跳过原生 setPosition，拖动后只归位一次', () => {
    const { glass, workArea } = createHarness();
    applyVisibleState(glass, { hintVisible: false, hintName: '' });
    const win = glass.getWindow();
    const setPosition = mock.method(win, 'setPosition');
    glass.resetPosition();
    glass.resetPosition();
    assert.equal(setPosition.mock.callCount(), 0);
    win.setPosition(workArea.x, workArea.y + 200);
    glass.resetPosition();
    glass.resetPosition();
    assert.equal(setPosition.mock.callCount(), 2);
});

test('拖动时收起倒计时会停止轮询；完全隐藏先停用采样再清拖动态', () => {
    for (const hintVisible of [false, true]) {
        const { glass, timers } = createHarness();
        const transitions = [];
        applyVisibleState(glass);
        readyBoth(glass);
        glass.on('visibility-changed', visible => transitions.push(['visible', visible]));
        glass.on('drag-ended', () => transitions.push(['drag-ended']));
        glass.beginDrag({ x: 500, y: 100 });
        assert.equal(timers.pending.size, 1);
        applyVisibleState(glass, { visible: false, hintVisible, hintName: hintVisible ? '数学' : '' });
        assert.equal(timers.pending.size, 0);
        assert.equal(glass.dragTimer, null);
        assert.equal(glass.dragAnchor, null);
        assert.deepEqual(transitions, hintVisible ? [['drag-ended']] : [['visible', false], ['drag-ended']]);
    }
});
