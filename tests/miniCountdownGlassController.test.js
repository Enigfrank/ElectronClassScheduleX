const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, mock } = require('node:test');
const vm = require('node:vm');
const MiniCountdownGlassController = require('../src/modules/miniCountdownGlassController');
const { createRequire } = require('node:module');
const { defaults } = require('../src/shared/miniCountdownGlassStyle.json');

const RECT = { x: 20, y: 10, width: 100, height: 40, cornerRadius: 8 };
const FRAME = { 0: { r: 0, g: 0, b: 0, darkTail: 0, lightTail: 0 } };

/** 创建可以发出真实生命周期事件的 Electron 窗口替身。 */
function createWindow(options = {}) {
    const window = new EventEmitter();
    window.bounds = options.bounds ?? { x: 100, y: 50, width: 1000, height: 120 };
    window.visible = options.visible ?? true;
    window.minimized = false;
    window.destroyed = false;
    window.loading = false;
    window.protected = options.protected ?? false;
    window.webContents = new EventEmitter();
    Object.assign(window.webContents, {
        isLoading: () => window.loading,
        isDestroyed: () => window.destroyed,
        send: mock.fn(),
        openDevTools: mock.fn()
    });
    Object.assign(window, {
        isDestroyed: () => window.destroyed,
        isVisible: () => window.visible,
        isMinimized: () => window.minimized,
        getContentBounds: () => ({ ...window.bounds }),
        getBounds: () => ({ ...window.bounds }),
        isContentProtected: () => window.protected,
        setContentProtection: mock.fn(value => { window.protected = value; }),
        setBounds: mock.fn(),
        isAlwaysOnTop: () => false,
        setAlwaysOnTop: mock.fn(),
        isMaximized: () => false,
        loadFile: mock.fn(() => Promise.resolve()),
        showInactive: mock.fn(),
        hide: mock.fn(() => { window.visible = false; window.emit('hide'); }),
        show: mock.fn(() => { window.visible = true; window.emit('show'); }),
        destroy: mock.fn(() => {
            window.destroyed = true;
            window.webContents.emit('destroyed');
            window.emit('closed');
        })
    });
    return window;
}

/** 创建原生桥接和一次性时钟替身，不加载真实 DLL 或启动捕获线程。 */
function createHarness(options = {}) {
    const panels = [];
    const timers = new Map();
    const screen = {
        scale: options.scale ?? 1,
        getDisplayMatching: mock.fn(() => ({ scaleFactor: screen.scale })),
        dipToScreenPoint: mock.fn(point => ({
            x: Math.round(point.x * screen.scale), y: Math.round(point.y * screen.scale)
        })),
        getPrimaryDisplay: () => ({ workAreaSize: { width: 1920, height: 1080 } })
    };
    const native = {
        isSupported: mock.fn(() => {
            if (options.supportError) throw options.supportError;
            return options.supported ?? true;
        }),
        createPanel: mock.fn(config => {
            if (options.createError) throw options.createError;
            if (options.nullPanel) return null;
            const panel = { config };
            for (const name of ['show', 'hide', 'destroy', 'setBounds', 'setParams', 'setLumaBands', 'onLuma']) {
                panel[name] = mock.fn();
            }
            panels.push(panel);
            return panel;
        }),
        shutdown: mock.fn()
    };
    if (!options.withoutCapturePolicy) native.setWindowCapturePolicy = mock.fn(() => options.capturePolicyResult ?? true);
    const loadNative = mock.fn(() => {
        if (options.loadError) throw options.loadError;
        return native;
    });
    const onState = mock.fn();
    const onError = mock.fn();
    const dependencies = {
        screen, style: options.style, loadNative, onState, onError,
        setTimeout: mock.fn((callback, delay) => {
            const timer = { callback, delay, unref: mock.fn() };
            timers.set(timer, callback);
            return timer;
        }),
        clearTimeout: mock.fn(timer => timers.delete(timer))
    };
    const controller = new MiniCountdownGlassController(dependencies);
    const window = createWindow({ protected: options.protected });
    controller.setWindow(window);
    return { controller, window, native, panels, timers, loadNative, onState, onError, screen, dependencies };
}

/** 启用控制器并提交本体矩形，返回等待首帧的原生面板。 */
function enable(harness, rect = RECT) {
    assert.equal(harness.controller.setEnabled(true), true);
    harness.controller.updateRect(rect);
    return harness.panels.at(-1);
}

/** 从 mock 获取原始实参，保持断言可读。 */
function calls(fn) {
    return fn.mock.calls.map(call => call.arguments);
}

test('默认关闭、上报矩形及退出均不加载原生模块', () => {
    const h = createHarness();
    h.controller.updateRect(RECT);
    h.window.emit('move');
    h.window.hide();
    h.window.show();
    assert.equal(h.controller.setEnabled(false), false);
    h.controller.shutdown();
    assert.equal(h.loadNative.mock.callCount(), 0);
    assert.equal(h.native.createPanel.mock.callCount(), 0);
    assert.equal(h.native.shutdown.mock.callCount(), 0);
    assert.equal(h.window.setContentProtection.mock.callCount(), 0);
    assert.equal(h.timers.size, 0);
});

test('显式启用只加载一次；没有矩形不启动捕获', () => {
    const h = createHarness();
    assert.equal(h.controller.setEnabled(true), true);
    assert.equal(h.controller.setEnabled(true), true);
    assert.equal(h.loadNative.mock.callCount(), 1);
    assert.equal(h.native.isSupported.mock.callCount(), 1);
    assert.equal(h.native.createPanel.mock.callCount(), 0);
    assert.equal(h.native.setWindowCapturePolicy.mock.callCount(), 0);
    h.controller.updateRect(RECT);
    assert.equal(h.panels.length, 1);
    h.controller.shutdown();
});

test('模块缺失、支持检查异常或设备不支持时关闭本次启用', () => {
    for (const options of [
        { loadError: new Error('missing DLL') },
        { supportError: new Error('support probe failed') },
        { supported: false }
    ]) {
        const h = createHarness(options);
        h.controller.updateRect(RECT);
        assert.equal(h.controller.setEnabled(true), false);
        assert.equal(h.onError.mock.callCount(), 1);
        assert.equal(h.controller.active, false);
        assert.equal(h.native.createPanel.mock.callCount(), 0);
        assert.equal(h.timers.size, 0);
        h.controller.shutdown();
    }
});

test('创建异常及空面板都会恢复捕获策略并清除首帧超时', () => {
    for (const options of [{ createError: new Error('device lost') }, { nullPanel: true }]) {
        const h = createHarness(options);
        h.controller.updateRect(RECT);
        assert.equal(h.controller.setEnabled(true), false);
        assert.equal(h.controller.active, false);
        assert.equal(h.onError.mock.callCount(), 1);
        assert.deepEqual(calls(h.native.setWindowCapturePolicy), [[h.window, 'all'], [h.window, 'none']]);
        assert.equal(h.native.shutdown.mock.callCount(), 1);
        assert.equal(h.timers.size, 0);
        h.controller.shutdown();
    }
});

test('只有有效原生首帧可激活玻璃，之后立即停止亮度回读', () => {
    const h = createHarness();
    const panel = enable(h);
    assert.equal(h.controller.active, false);
    assert.equal(h.timers.size, 1);
    assert.deepEqual(panel.config.lumaBands, [{ id: 0, x: 49, y: 19, width: 2, height: 2 }]);
    assert.equal(panel.config.capturePolicy, 'all');
    assert.equal(panel.config.anchorWindow, h.window);
    assert.deepEqual(calls(panel.show), [[0]]);
    panel.config.onLuma({});
    panel.config.onLuma({ 0: { ...FRAME[0], r: NaN } });
    assert.equal(h.controller.active, false);
    panel.config.onLuma(FRAME);
    assert.equal(h.controller.active, true);
    assert.deepEqual(calls(panel.setLumaBands), [[[]]]);
    assert.deepEqual(calls(panel.onLuma), [[null]]);
    assert.equal(h.timers.size, 0);
    panel.config.onLuma(FRAME);
    assert.deepEqual(calls(h.onState), [[{ active: false, style: defaults }], [{ active: true, style: defaults }]]);
    assert.equal(panel.setLumaBands.mock.callCount(), 1);
    h.controller.shutdown();
});

test('有效面板句柄仍需首帧确认，超时关闭且忽略迟到的回调', () => {
    const h = createHarness();
    const panel = enable(h);
    const timer = [...h.timers.keys()][0];
    assert.equal(timer.delay, 5000);
    timer.callback();
    assert.equal(h.controller.enabled, false);
    assert.equal(h.controller.active, false);
    assert.equal(panel.destroy.mock.callCount(), 1);
    assert.equal(h.onError.mock.callCount(), 1);
    assert.equal(h.timers.size, 0);
    assert.deepEqual(calls(h.onState), [[{ active: false, style: defaults }], [{ active: false, style: defaults }]]);
    panel.config.onLuma(FRAME);
    assert.equal(h.controller.active, false);
    const replacement = enable(h);
    timer.callback();
    panel.config.onLuma(FRAME);
    assert.equal(replacement.destroy.mock.callCount(), 0);
    assert.equal(h.controller.active, false);
    replacement.config.onLuma(FRAME);
    assert.equal(h.controller.active, true);
    h.controller.shutdown();
});

test('相同几何不重复更新原生矩形或参数，半径改变只发送完整参数', () => {
    const h = createHarness();
    const panel = enable(h);
    panel.config.onLuma(FRAME);
    h.controller.updateRect({ ...RECT });
    h.window.emit('move');
    h.window.emit('resize');
    assert.equal(panel.setBounds.mock.callCount(), 0);
    assert.equal(panel.setParams.mock.callCount(), 0);
    h.controller.updateRect({ ...RECT, x: 25 });
    assert.deepEqual(calls(panel.setBounds), [[{ x: 125, y: 60, width: 100, height: 40 }]]);
    assert.equal(panel.setParams.mock.callCount(), 0);
    h.controller.updateRect({ ...RECT, x: 25, cornerRadius: 12 });
    assert.equal(panel.setBounds.mock.callCount(), 1);
    assert.deepEqual(calls(panel.setParams), [[{
        cornerRadius: 12, blurSigma: 1, displacementScale: 24, aberrationIntensity: 0, saturation: 1.15
    }]]);
    h.controller.updateRect({ ...RECT, x: 25, cornerRadius: 12 });
    assert.equal(panel.setParams.mock.callCount(), 1);
    h.controller.shutdown();
});

test('使用显示器局部 DIP 到物理角点转换，并限制物理圆角', () => {
    const h = createHarness({ scale: 1.5 });
    h.window.bounds.x = 1010;
    h.screen.dipToScreenPoint = mock.fn(point => ({
        x: Math.round(2000 + (point.x - 1000) * 1.5), y: Math.round(point.y * 1.5)
    }));
    const panel = enable(h, { ...RECT, cornerRadius: 100 });
    assert.deepEqual(panel.config.lumaBands, [{ id: 0, x: 74, y: 29, width: 2, height: 2 }]);
    assert.deepEqual(calls(h.screen.dipToScreenPoint), [[{ x: 1030, y: 60 }], [{ x: 1130, y: 100 }]]);
    assert.deepEqual(calls(h.screen.getDisplayMatching), [[{ x: 1030, y: 60, width: 100, height: 40 }]]);
    assert.deepEqual({ x: panel.config.x, y: panel.config.y, width: panel.config.width,
        height: panel.config.height, dpr: panel.config.dpr, cornerRadius: panel.config.cornerRadius },
    { x: 2045, y: 90, width: 150, height: 60, dpr: 1.5, cornerRadius: 30 });
    assert.equal(panel.config.blurSigma, 1.5);
    h.controller.shutdown();
});

test('DPR 改变时重建面板，旧面板首帧不能激活新面板', () => {
    const h = createHarness();
    const old = enable(h);
    old.config.onLuma(FRAME);
    h.screen.scale = 2;
    h.window.emit('move');
    const current = h.panels.at(-1);
    assert.notEqual(current, old);
    assert.equal(old.destroy.mock.callCount(), 1);
    assert.equal(current.config.dpr, 2);
    assert.equal(current.config.blurSigma, 2);
    assert.equal(current.config.cornerRadius, 16);
    assert.equal(h.controller.active, false);
    old.config.onLuma(FRAME);
    assert.equal(h.controller.active, false);
    current.config.onLuma(FRAME);
    assert.equal(h.controller.active, true);
    h.controller.shutdown();
});

test('隐藏及最小化释放捕获，恢复显示时从缓存矩形重建', () => {
    const h = createHarness();
    const old = enable(h);
    old.config.onLuma(FRAME);
    h.window.hide();
    assert.equal(old.destroy.mock.callCount(), 1);
    assert.equal(h.native.shutdown.mock.callCount(), 1);
    assert.equal(h.controller.active, false);
    h.window.emit('hide');
    assert.equal(h.native.shutdown.mock.callCount(), 1);
    h.window.show();
    assert.equal(h.panels.length, 2);
    old.config.onLuma(FRAME);
    assert.equal(h.controller.active, false);
    h.panels[1].config.onLuma(FRAME);
    assert.equal(h.controller.active, true);
    h.window.minimized = true;
    h.window.emit('minimize');
    assert.equal(h.panels[1].destroy.mock.callCount(), 1);
    h.window.minimized = false;
    h.window.emit('restore');
    assert.equal(h.panels.length, 3);
    h.controller.shutdown();
});

test('空或无效矩形销毁面板并清除缓存，显示事件不能复活旧位置', () => {
    for (const rect of [null, { ...RECT, width: 0 }, { ...RECT, x: NaN }, { ...RECT, cornerRadius: NaN }]) {
        const h = createHarness();
        const panel = enable(h);
        h.controller.updateRect(rect);
        assert.equal(panel.destroy.mock.callCount(), 1);
        assert.equal(h.native.shutdown.mock.callCount(), 1);
        assert.equal(h.timers.size, 0);
        h.window.hide();
        h.window.show();
        assert.equal(h.panels.length, 1);
        h.controller.shutdown();
    }
    const h = createHarness();
    const panel = enable(h);
    h.controller.updateRect({ ...RECT, x: 999 });
    assert.equal(panel.destroy.mock.callCount(), 1);
    assert.equal(h.onError.mock.callCount(), 0);
    h.controller.shutdown();
});

test('重载及 renderer 退出立即销毁，等待新页面和新矩形后恢复', () => {
    const h = createHarness();
    const old = enable(h);
    old.config.onLuma(FRAME);
    for (let i = 0; i < 3; i++) {
        const previous = h.panels.at(-1);
        h.window.webContents.emit('did-start-loading');
        assert.equal(previous.destroy.mock.callCount(), 1);
        assert.equal(h.controller.active, false);
        assert.equal(h.controller.rect, null);
        previous.config.onLuma(FRAME);
        assert.equal(h.controller.active, false);
        h.window.emit('show');
        assert.equal(h.panels.length, i + 1);
        h.controller.updateRect(RECT);
        assert.equal(h.panels.length, i + 1);
        h.window.webContents.emit('did-finish-load');
        assert.equal(h.panels.length, i + 2);
        assert.equal(h.window.webContents.listenerCount('did-start-loading'), 1);
        assert.equal(h.window.listenerCount('show'), 1);
    }
    h.window.webContents.emit('render-process-gone');
    assert.equal(h.controller.panel, null);
    assert.equal(h.controller.rect, null);
    h.controller.updateRect(RECT);
    assert.equal(h.controller.panel, null);
    h.controller.shutdown();
});

test('窗口替换和退出移除监听；旧窗口及旧回调不会影响新窗口', () => {
    const h = createHarness();
    const old = enable(h);
    const oldWindow = h.window;
    const replacement = createWindow();
    h.controller.setWindow(replacement);
    assert.equal(old.destroy.mock.callCount(), 1);
    assert.deepEqual(oldWindow.eventNames(), []);
    assert.deepEqual(oldWindow.webContents.eventNames(), []);
    h.controller.updateRect(RECT);
    old.config.onLuma(FRAME);
    oldWindow.hide();
    assert.equal(h.controller.panel, h.panels[1]);
    assert.equal(h.controller.active, false);
    replacement.destroy();
    assert.equal(h.panels[1].destroy.mock.callCount(), 1);
    assert.deepEqual(replacement.eventNames(), []);
    assert.deepEqual(replacement.webContents.eventNames(), []);
    h.controller.shutdown();
    h.controller.shutdown();
    assert.equal(h.controller.setEnabled(true), false);
    assert.equal(h.timers.size, 0);
});

test('关闭偏好销毁资源并恢复此前的捕获策略', () => {
    for (const protectedBefore of [false, true]) {
        const h = createHarness({ protected: protectedBefore });
        const panel = enable(h);
        panel.config.onLuma(FRAME);
        assert.equal(h.controller.setEnabled(false), false);
        assert.equal(panel.destroy.mock.callCount(), 1);
        assert.deepEqual(calls(panel.hide), [[0]]);
        assert.equal(h.controller.active, false);
        assert.equal(h.native.shutdown.mock.callCount(), 1);
        assert.deepEqual(calls(h.native.setWindowCapturePolicy), [
            [h.window, 'all'], [h.window, protectedBefore ? 'all' : 'none']
        ]);
        panel.config.onLuma(FRAME);
        h.window.emit('show');
        assert.equal(h.panels.length, 1);
        assert.equal(h.onError.mock.callCount(), 0);
        h.controller.shutdown();
    }
});

test('捕获策略接口不可用或拒绝时回退到 Electron 内容保护并恢复', () => {
    for (const options of [{ withoutCapturePolicy: true }, { capturePolicyResult: false }]) {
        const h = createHarness(options);
        enable(h);
        assert.equal(h.window.protected, true);
        h.controller.setEnabled(false);
        assert.equal(h.window.protected, false);
        assert.deepEqual(calls(h.window.setContentProtection), [[true], [false]]);
        h.controller.shutdown();
    }
});

test('原生更新和首帧回读关闭失败时只报错一次并恢复黑底', () => {
    for (const operation of ['setBounds', 'setParams', 'setLumaBands', 'show']) {
        const h = createHarness();
        const panel = enable(h);
        panel[operation].mock.mockImplementation(() => { throw new Error(operation); });
        if (operation === 'setBounds') h.controller.updateRect({ ...RECT, x: 30 });
        if (operation === 'setParams') h.controller.updateRect({ ...RECT, cornerRadius: 12 });
        if (operation === 'setLumaBands') panel.config.onLuma(FRAME);
        if (operation === 'show') {
            h.controller.setEnabled(false);
            h.native.createPanel.mock.mockImplementation(() => panel);
            h.controller.setEnabled(true);
        }
        assert.equal(h.controller.enabled, false);
        assert.equal(h.controller.active, false);
        assert.equal(h.onError.mock.callCount(), 1);
        panel.config.onLuma(FRAME);
        assert.equal(h.onError.mock.callCount(), 1);
        assert.equal(calls(h.native.setWindowCapturePolicy).at(-1)[1], 'none');
        h.controller.shutdown();
    }
});

test('面板销毁异常不妨碍 shutdown 和主窗口捕获策略恢复', () => {
    const h = createHarness();
    const panel = enable(h);
    panel.destroy.mock.mockImplementation(() => { throw new Error('destroy failed'); });
    h.native.shutdown.mock.mockImplementation(() => { throw new Error('shutdown failed'); });
    h.window.hide();
    assert.equal(h.onError.mock.callCount(), 1);
    assert.equal(h.controller.enabled, false);
    assert.equal(h.native.shutdown.mock.callCount(), 1);
    assert.equal(calls(h.native.setWindowCapturePolicy).at(-1)[1], 'none');
    assert.equal(h.timers.size, 0);
    h.controller.shutdown();
});

/** 将 WindowManager 放进独立模块上下文，验证真实接线且不污染 require 全局状态。 */
function createWindowManagerHarness(options = {}) {
    const h = createHarness(options);
    h.controller.shutdown();
    const app = new EventEmitter();
    app.isPackaged = true;
    const settings = { isMiniCountdownLiquidGlass: options.persisted ?? false,
        miniCountdownGlassStyle: options.style };
    const config = {
        get: (key, fallback) => settings[key] ?? fallback,
        set: mock.fn((key, value) => { settings[key] = value; }),
        getWindowAlwaysOnTop: () => false,
        getAutoLaunch: () => false
    };
    const logger = { warn: mock.fn(), error: mock.fn(), info: mock.fn() };
    /** 让窗口管理器实例使用相同的可控原生依赖。 */
    class InjectedController extends MiniCountdownGlassController {
        /** 保留生产状态与失败处理器，替换原生和时钟。 */
        constructor(dependencies) {
            super({ ...h.dependencies, ...dependencies, loadNative: h.loadNative });
        }
    }
    /** 创建窗口管理器需要的 BrowserWindow 替身。 */
    function BrowserWindow(options) {
        return createWindow({
            bounds: { x: options.x ?? 0, y: options.y ?? 0, width: options.width, height: options.height },
            visible: options.show ?? true
        });
    }
    /** 只提供本次测试需要的考试模式状态。 */
    class ExamController {
        /** 正常模式不占用考试窗口。 */
        isActive() { return false; }
    }
    const filename = path.resolve(__dirname, '../src/modules/windowManager.js');
    const context = {
        module: { exports: {} }, __dirname: path.dirname(filename), console,
        /** 对本地依赖定向注入，其他依赖保持 Node 原有行为。 */
        require(request) {
            if (request === 'electron') return { app, screen: h.screen, BrowserWindow };
            if (request === './miniCountdownGlassController') return InjectedController;
            if (request === './examModeWindowController') return ExamController;
            return createRequire(filename)(request);
        }
    };
    vm.runInNewContext(readFileSync(filename, 'utf8'), context, { filename });
    const manager = new context.module.exports(config, logger);
    return { ...h, app, settings, config, logger, manager };
}

test('WindowManager 默认关闭、GUI 初始值、失败回退及退出清理接线完整', () => {
    const h = createWindowManagerHarness();
    const main = h.manager.createMainWindow();
    assert.equal(h.loadNative.mock.callCount(), 0);
    assert.equal(h.app.listenerCount('before-quit'), 1);
    const gui = h.manager.createReactGUIWindow();
    gui.webContents.emit('did-finish-load');
    const init = calls(gui.webContents.send).find(([channel]) => channel === 'init')[1];
    assert.equal(init.isMiniCountdownLiquidGlass, false);
    assert.equal(h.manager.setMiniCountdownLiquidGlass(true), true);
    assert.equal(h.config.set.mock.callCount(), 0);
    // 模拟设置 IPC 已将接受值持久化。
    h.settings.isMiniCountdownLiquidGlass = true;
    h.manager.updateMiniCountdownGlass(RECT);
    const panel = h.panels[0];
    panel.config.onLuma(FRAME);
    const activeState = calls(main.webContents.send).at(-1);
    assert.equal(activeState[0], 'mini-countdown-glass-state');
    assert.equal(activeState[1].active, true);
    h.manager.updateMiniCountdownGlass({ ...RECT, x: 30 });
    assert.equal(h.manager.getWindow('touchDragOverlay').setBounds.mock.callCount(), 0);
    assert.equal(h.manager.setMiniCountdownLiquidGlass(false), false);
    assert.equal(h.config.set.mock.callCount(), 0);
    assert.equal(h.settings.isMiniCountdownLiquidGlass, true);
    h.manager.setMiniCountdownLiquidGlass(true);
    const timer = [...h.timers.keys()][0];
    timer.callback();
    assert.equal(h.settings.isMiniCountdownLiquidGlass, false);
    assert.equal(h.config.set.mock.callCount(), 1);
    assert.equal(calls(h.config.set)[0][0], 'isMiniCountdownLiquidGlass');
    assert.equal(calls(h.config.set)[0][1], false);
    const checkbox = calls(gui.webContents.send).find(([channel]) => channel === 'updateCheckbox');
    assert.equal(checkbox[1].id, 'isMiniCountdownLiquidGlass');
    assert.equal(checkbox[1].checked, false);
    assert.equal(h.logger.warn.mock.callCount(), 1);
    h.manager.setMiniCountdownLiquidGlass(true);
    h.panels.at(-1).config.onLuma(FRAME);
    h.app.emit('before-quit');
    assert.equal(h.manager.miniCountdownGlassController.disposed, true);
    assert.equal(h.panels.at(-1).destroy.mock.callCount(), 1);
    assert.equal(main.listenerCount('show'), 1);
    assert.equal(h.app.listenerCount('before-quit'), 0);
});

test('WindowManager 重建主窗口不复用旧矩形，不增加应用退出监听', () => {
    const h = createWindowManagerHarness({ persisted: true });
    const main = h.manager.createMainWindow();
    h.manager.updateMiniCountdownGlass(RECT);
    const old = h.panels[0];
    const replacement = h.manager.reloadMainScheduleWindow();
    assert.notEqual(replacement, main);
    assert.equal(old.destroy.mock.callCount(), 1);
    assert.equal(h.panels.length, 1);
    assert.equal(main.webContents.listenerCount('did-start-loading'), 0);
    assert.equal(h.app.listenerCount('before-quit'), 1);
    h.manager.updateMiniCountdownGlass(RECT);
    assert.equal(h.panels.length, 2);
    old.config.onLuma(FRAME);
    assert.equal(h.manager.miniCountdownGlassController.active, false);
    h.app.emit('before-quit');
});

test('关闭模式修改样式推送状态，不加载原生模块且首次加载恢复样式', () => {
    const style = { backgroundColor: '#ABCDEF', blurSigma: 0, opacity: 0 };
    const h = createHarness();
    assert.equal(h.controller.setStyle(style), true);
    assert.equal(h.loadNative.mock.callCount(), 0);
    assert.deepEqual(calls(h.onState).at(-1)[0], {
        active: false, style: { ...style, backgroundColor: '#abcdef' }
    });
    h.window.webContents.emit('did-finish-load');
    assert.deepEqual(calls(h.onState).at(-1)[0].style, h.controller.style);
    const panel = enable(h);
    assert.equal(panel.config.blurSigma, 0);
    h.controller.shutdown();
});

test('相同样式和仅颜色透明度修改不调用原生 setter，active 不变也推送新色值', () => {
    const h = createHarness();
    const panel = enable(h);
    panel.config.onLuma(FRAME);
    const initialStates = h.onState.mock.callCount();
    assert.equal(h.controller.setStyle({ ...defaults }), true);
    const style = { ...defaults, backgroundColor: '#ABCDEF', opacity: 0.8 };
    assert.equal(h.controller.setStyle(style), true);
    assert.equal(panel.setParams.mock.callCount(), 0);
    assert.equal(panel.setBounds.mock.callCount(), 0);
    assert.equal(panel.destroy.mock.callCount(), 0);
    assert.equal(h.panels.length, 1);
    assert.equal(h.loadNative.mock.callCount(), 1);
    assert.equal(h.onState.mock.callCount(), initialStates + 2);
    assert.deepEqual(calls(h.onState).at(-1)[0], {
        active: true, style: { ...style, backgroundColor: '#abcdef' }
    });
    h.controller.shutdown();
});

test('真实模糊变化仅提交一次完整原生参数，之后同步不重复提交或重建', () => {
    const h = createHarness({ scale: 1.5 });
    const panel = enable(h);
    panel.config.onLuma(FRAME);
    assert.equal(h.controller.setStyle({ ...defaults, blurSigma: 2.4 }), true);
    assert.deepEqual(calls(panel.setParams), [[{
        cornerRadius: 12, blurSigma: 2.4 * 1.5, displacementScale: 36,
        aberrationIntensity: 0, saturation: 1.15
    }]]);
    h.controller.updateRect(RECT);
    h.window.emit('move');
    assert.equal(panel.setParams.mock.callCount(), 1);
    assert.equal(panel.setBounds.mock.callCount(), 0);
    assert.equal(panel.destroy.mock.callCount(), 0);
    assert.equal(h.panels.length, 1);
    assert.equal(h.controller.active, true);
    h.controller.shutdown();
});

test('样式原生应用失败返回 false，保留旧样式并沿用关闭回退', () => {
    const h = createHarness();
    const panel = enable(h);
    panel.config.onLuma(FRAME);
    panel.setParams.mock.mockImplementation(() => { throw new Error('apply failed'); });
    assert.equal(h.controller.setStyle({ ...defaults, blurSigma: 3 }), false);
    assert.deepEqual(h.controller.style, defaults);
    assert.equal(h.controller.active, false);
    assert.equal(h.controller.enabled, false);
    assert.equal(panel.destroy.mock.callCount(), 1);
    assert.equal(h.onError.mock.callCount(), 1);
    assert.equal(h.controller.setStyle({ opacity: 0.1 }), false);
    h.controller.shutdown();
    assert.equal(h.controller.setStyle(defaults), false);
});

test('WindowManager 启动、重载、重建和重新启动恢复持久化样式', () => {
    const style = { backgroundColor: '#AABBCC', blurSigma: 4, opacity: 0.6 };
    const normalized = { ...style, backgroundColor: '#aabbcc' };
    const h = createWindowManagerHarness({ style, persisted: true });
    const main = h.manager.createMainWindow();
    assert.deepEqual(h.manager.getMiniCountdownGlassStyle(), normalized);
    assert.deepEqual({ ...calls(main.webContents.send).find(([channel]) => channel === 'mini-countdown-glass-state')[1] }, {
        active: false, style: normalized
    });
    h.manager.updateMiniCountdownGlass(RECT);
    assert.equal(h.panels.at(-1).config.blurSigma, 4);
    main.webContents.emit('did-start-loading');
    main.webContents.emit('did-finish-load');
    assert.deepEqual(calls(main.webContents.send).at(-1)[1].style, normalized);
    const replacement = h.manager.reloadMainScheduleWindow();
    assert.deepEqual(calls(replacement.webContents.send).find(([channel]) => channel === 'mini-countdown-glass-state')[1].style, normalized);
    h.app.emit('before-quit');
    const restarted = createWindowManagerHarness({ style: h.settings.miniCountdownGlassStyle, persisted: true });
    restarted.manager.createMainWindow();
    assert.deepEqual(restarted.manager.getMiniCountdownGlassStyle(), normalized);
    restarted.manager.updateMiniCountdownGlass(RECT);
    assert.equal(restarted.panels.at(-1).config.blurSigma, 4);
    restarted.app.emit('before-quit');
});
