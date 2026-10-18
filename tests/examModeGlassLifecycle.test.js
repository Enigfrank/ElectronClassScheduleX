const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, mock } = require('node:test');

const controllerPath = path.join(__dirname, '..', 'src', 'modules', 'examModeWindowController.js');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');

/**
 * 创建隔离的 Electron 替身，运行真实控制器及其窗口生命周期。
 * @param {{loadError?: Error, showError?: Error, hideError?: Error}} options 故障注入
 * @returns {Object} 控制器、窗口和调用记录
 */
function createHarness(options = {}) {
    const app = new EventEmitter();
    const suppressionCalls = [];
    const glass = {
        /** 记录玻璃倒计时的抑制切换。 */
        setSuppressed(suppressed) {
            suppressionCalls.push(suppressed);
        }
    };
    const mainWindow = {
        isDestroyed: mock.fn(() => false),
        hide: mock.fn(() => {
            if (options.hideError) throw options.hideError;
        }),
        show: mock.fn()
    };
    const guiWindow = {
        isDestroyed: mock.fn(() => false),
        hide: mock.fn(),
        show: mock.fn(),
        focus: mock.fn(),
        getBounds: mock.fn(() => ({ x: 0, y: 0, width: 800, height: 600 }))
    };
    const examWindows = [];

    class FakeBrowserWindow extends EventEmitter {
        /** 创建可发送就绪和崩溃事件的考试窗口。 */
        constructor() {
            super();
            this.destroyed = false;
            this.webContents = new EventEmitter();
            this.webContents.send = mock.fn();
            this.setFullScreen = mock.fn();
            this.setAlwaysOnTop = mock.fn();
            this.show = mock.fn(() => {
                if (options.showError) throw options.showError;
            });
            this.focus = mock.fn();
            this.moveTop = mock.fn();
            examWindows.push(this);
        }

        /** 返回窗口是否已销毁。 */
        isDestroyed() {
            return this.destroyed;
        }

        /** 模拟完成页面初始化，或导航失败。 */
        async loadFile() {
            this.webContents.emit('ipc-message', {}, 'exam-mode-ready');
            if (options.loadError) throw options.loadError;
        }

        /** 销毁窗口并执行真实控制器注册的关闭回调。 */
        destroy() {
            if (this.destroyed) return;
            this.destroyed = true;
            this.emit('closed');
        }
    }

    const display = { bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
    const electron = {
        app,
        BrowserWindow: FakeBrowserWindow,
        screen: {
            getDisplayMatching: () => display,
            getPrimaryDisplay: () => display
        }
    };
    const moduleStub = { exports: {} };
    vm.runInNewContext(controllerSource, {
        module: moduleStub,
        require: name => name === 'electron' ? electron : require(name),
        __dirname: path.dirname(controllerPath),
        setTimeout,
        clearTimeout
    }, { filename: controllerPath });

    const windowManager = {
        getWindow: name => name === 'main' ? mainWindow : guiWindow,
        getMiniCountdownGlassWindow: () => glass,
        stopMainWindowAlwaysOnTopGuard: mock.fn(),
        setWindowAlwaysOnTop: mock.fn()
    };
    const controller = new moduleStub.exports({
        windowManager,
        configManager: { getWindowAlwaysOnTop: () => true }
    });
    return { app, controller, mainWindow, guiWindow, suppressionCalls, examWindows, windowManager };
}

test('进入后正常退出解除玻璃倒计时抑制，重复退出保持幂等', async () => {
    const { controller, suppressionCalls, mainWindow, guiWindow } = createHarness();

    await controller.enter([]);
    assert.deepEqual(suppressionCalls, [true]);
    assert.equal(mainWindow.hide.mock.callCount(), 1);
    assert.equal(guiWindow.hide.mock.callCount(), 1);

    controller.exit();
    controller.exit();
    assert.deepEqual(suppressionCalls, [true, false]);
    assert.equal(mainWindow.show.mock.callCount(), 1);
    assert.equal(guiWindow.show.mock.callCount(), 1);
    assert.equal(controller.isActive(), false);
});

test('并发进入、重复进入和重复隐藏只抑制一次', async () => {
    const { controller, suppressionCalls, examWindows } = createHarness();
    const firstEnter = controller.enter([]);
    assert.equal(controller.enter([]), firstEnter);
    const examWindow = await firstEnter;

    assert.equal(await controller.enter([]), examWindow);
    controller.hideNormalWindows();
    assert.equal(examWindows.length, 1);
    assert.deepEqual(suppressionCalls, [true]);

    controller.exit();
    assert.deepEqual(suppressionCalls, [true, false]);
});

test('页面加载失败时不改变玻璃倒计时和正常窗口', async () => {
    const { controller, suppressionCalls, mainWindow, examWindows } = createHarness({
        loadError: new Error('load failed')
    });

    await assert.rejects(controller.enter([]), /load failed/);
    assert.deepEqual(suppressionCalls, []);
    assert.equal(mainWindow.hide.mock.callCount(), 0);
    assert.equal(mainWindow.show.mock.callCount(), 0);
    assert.equal(examWindows[0].isDestroyed(), true);
});

test('隐藏正常窗口失败时回滚玻璃倒计时抑制', async () => {
    const { controller, suppressionCalls, mainWindow } = createHarness({
        hideError: new Error('hide failed')
    });

    await assert.rejects(controller.enter([]), /hide failed/);
    assert.deepEqual(suppressionCalls, [true, false]);
    assert.equal(mainWindow.show.mock.callCount(), 1);
    assert.equal(controller.normalWindowsHidden, false);
});

test('考试窗口显示失败时通过关闭及回滚路径只恢复一次', async () => {
    const { controller, suppressionCalls, mainWindow } = createHarness({
        showError: new Error('show failed')
    });

    await assert.rejects(controller.enter([]), /show failed/);
    assert.deepEqual(suppressionCalls, [true, false]);
    assert.equal(mainWindow.show.mock.callCount(), 1);
    assert.equal(controller.getWindow(), null);
});

test('考试窗口意外关闭后恢复玻璃倒计时', async () => {
    const { controller, suppressionCalls, mainWindow } = createHarness();
    const examWindow = await controller.enter([]);

    examWindow.destroy();
    controller.restoreNormalWindows();
    assert.deepEqual(suppressionCalls, [true, false]);
    assert.equal(mainWindow.show.mock.callCount(), 1);
});

test('考试渲染进程崩溃后恢复玻璃倒计时', async () => {
    const { controller, suppressionCalls, mainWindow } = createHarness();
    const examWindow = await controller.enter([]);

    examWindow.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    controller.exit();
    assert.equal(examWindow.isDestroyed(), true);
    assert.deepEqual(suppressionCalls, [true, false]);
    assert.equal(mainWindow.show.mock.callCount(), 1);
});

test('应用退出后关闭考试窗口时保持抑制且不重新显示正常窗口', async () => {
    const { app, controller, suppressionCalls, mainWindow, guiWindow } = createHarness();
    await controller.enter([]);

    app.emit('before-quit');
    controller.exit();
    controller.restoreNormalWindows();
    assert.deepEqual(suppressionCalls, [true]);
    assert.equal(mainWindow.show.mock.callCount(), 0);
    assert.equal(guiWindow.show.mock.callCount(), 0);
});

test('再次进入考试模式时重新抑制玻璃倒计时', async () => {
    const { controller, suppressionCalls } = createHarness();

    await controller.enter([]);
    controller.exit();
    await controller.enter([]);
    controller.exit();
    assert.deepEqual(suppressionCalls, [true, false, true, false]);
});
