const assert = require('node:assert/strict');
const { test } = require('node:test');
const { isValidGlassPresentation } = require('../src/shared/glassPresentation');
const registerWindowIpc = require('../src/modules/ipc/registerWindowIpc');

const RECT = { x: 12, y: 8, width: 200, height: 40, cornerRadius: 8 };

/** 注册真实 IPC，用独立记录区分背景与交互窗口的更新。 */
function createHarness() {
    const handlers = new Map();
    const calls = [];
    const sender = {};
    registerWindowIpc({
        ipcMain: { on: (channel, handler) => handlers.set(channel, handler) },
        windowManager: {
            getWindow: () => ({ isDestroyed: () => false, webContents: sender }),
            updateMiniCountdownGlass: (...args) => calls.push(['mini', ...args]),
            updateToolbarGlass: (...args) => calls.push(['toolbar', ...args]),
            updateTouchDragOverlay: () => assert.fail('原生过渡不能改变交互窗口')
        },
        screen: { getCursorScreenPoint: () => assert.fail('动画不能轮询鼠标位置') },
        log() {}
    });
    return { handlers, calls, sender };
}

test('原生动画参数只接受明确显隐与有界整数时长，保留旧矩形协议', () => {
    for (const value of [undefined, { visible: true, durationMs: 0 }, { visible: false, durationMs: 400 }]) {
        assert.equal(isValidGlassPresentation(value), true);
    }
    for (const value of [null, {}, { visible: 1, durationMs: 100 }, { visible: true, durationMs: -1 },
        { visible: true, durationMs: 401 }, { visible: true, durationMs: 1.5 },
        { visible: true, durationMs: NaN }, { visible: true, durationMs: '200' }]) {
        assert.equal(isValidGlassPresentation(value), false);
    }
});

test('两个原生背景通道均透传显隐参数，拒绝其他sender与非法时长', () => {
    const h = createHarness();
    const mini = h.handlers.get('mini-countdown-glass-rect');
    const toolbar = h.handlers.get('toolbar-glass-rect');
    const presentation = { visible: false, durationMs: 80 };
    mini({ sender: {} }, RECT, presentation);
    toolbar({ sender: {} }, { id: 'classContainer', rect: RECT, presentation });
    for (const invalid of [null, {}, { visible: false, durationMs: 500 }, { visible: true, durationMs: Infinity }]) {
        mini({ sender: h.sender }, RECT, invalid);
        toolbar({ sender: h.sender }, { id: 'classContainer', rect: RECT, presentation: invalid });
    }
    assert.deepEqual(h.calls, []);
    mini({ sender: h.sender }, RECT, presentation);
    toolbar({ sender: h.sender }, { id: 'classContainer', rect: RECT, presentation });
    mini({ sender: h.sender }, null);
    toolbar({ sender: h.sender }, { id: 'classContainer', rect: null });
    assert.deepEqual(h.calls, [
        ['mini', RECT, presentation], ['toolbar', 'classContainer', RECT, presentation],
        ['mini', null, undefined], ['toolbar', 'classContainer', null, undefined]
    ]);
});

test('旧版矩形调用仍有效，所有工具栏区域均接受空矩形与临时显隐', () => {
    const h = createHarness();
    const event = { sender: h.sender };
    const mini = h.handlers.get('mini-countdown-glass-rect');
    const toolbar = h.handlers.get('toolbar-glass-rect');
    const presentation = { visible: true, durationMs: 400 };
    mini(event, RECT);
    mini(event, null, presentation);
    const expected = [['mini', RECT, undefined], ['mini', null, presentation]];
    for (const id of ['classContainer', 'countdownSidebar', 'countdowner', 'nextClassHint']) {
        toolbar(event, { id, rect: RECT });
        toolbar(event, { id, rect: RECT, presentation });
        toolbar(event, { id, rect: null, presentation });
        expected.push(['toolbar', id, RECT, undefined], ['toolbar', id, RECT, presentation],
            ['toolbar', id, null, presentation]);
    }
    assert.deepEqual(h.calls, expected);
});

test('无效矩形与未知区域不能借显隐参数进入窗口管理器', () => {
    const h = createHarness();
    const event = { sender: h.sender };
    const mini = h.handlers.get('mini-countdown-glass-rect');
    const toolbar = h.handlers.get('toolbar-glass-rect');
    const presentation = { visible: false, durationMs: 80 };
    for (const rect of [undefined, {}, { ...RECT, x: Infinity }, { ...RECT, width: 0 },
        { ...RECT, height: -1 }, { ...RECT, cornerRadius: -1 }, { ...RECT, cornerRadius: NaN }]) {
        mini(event, rect, presentation);
        toolbar(event, { id: 'classContainer', rect, presentation });
    }
    for (const payload of [undefined, null, {}, { id: 'unknown', rect: RECT, presentation },
        { id: '__proto__', rect: RECT, presentation }]) toolbar(event, payload);
    assert.deepEqual(h.calls, []);
});
