const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createMiniCountdownGlass } = require('../src/js/miniCountdownGlass');
const registerWindowIpc = require('../src/modules/ipc/registerWindowIpc');

/** 构造最小页面依赖，观察布局测量、IPC 和监听清理行为。 */
function createFixture() {
    const messages = [];
    const classes = new Set();
    const listeners = new Map();
    const counts = { measurements: 0, disconnected: 0, unsubscribed: 0, styleWrites: 0, styleNodes: 0 };
    let notifyResize;
    let styleSheet;
    const document = {
        getElementById: () => styleSheet,
        createElement(tag) {
            assert.equal(tag, 'style');
            let text = '';
            return {
                get textContent() { return text; },
                set textContent(value) { text = value; counts.styleWrites += 1; }
            };
        },
        head: { appendChild(node) { styleSheet = node; counts.styleNodes += 1; } }
    };
    const bounds = { x: 100, y: 8, width: 200, height: 40 };
    const element = {
        id: 'miniCountdown',
        ownerDocument: document,
        style: { display: 'block' },
        classList: {
            contains: value => classes.has(value),
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); }
        },
        getBoundingClientRect() { counts.measurements += 1; return { ...bounds }; }
    };
    const api = {
        send(channel, value) { messages.push({ channel, value }); },
        on(channel, callback) {
            listeners.set(channel, callback);
            return () => { counts.unsubscribed += 1; listeners.delete(channel); };
        }
    };
    const sync = createMiniCountdownGlass({
        api,
        element,
        getStyle: () => ({ borderTopLeftRadius: '16px' }),
        observe(callback) {
            notifyResize = callback;
            return { observe() {}, disconnect() { counts.disconnected += 1; } };
        }
    });
    return {
        sync, api, messages, classes, element, bounds, counts, styleSheet: () => styleSheet,
        resize: () => notifyResize(),
        state: value => listeners.get('mini-countdown-glass-state')(undefined, value)
    };
}

/** 执行真实工具条脚本，用可控动画帧验证拖动、隐藏与原生同步的交错。 */
function createPageFixture() {
    const fixture = createFixture();
    const frames = new Map();
    let frameId = 0;
    const { element, bounds, counts } = fixture;
    element.getBoundingClientRect = () => {
        counts.measurements += 1;
        const position = element.style.transform?.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
        const x = position ? Number(position[1]) : bounds.x;
        const y = position ? Number(position[2]) : bounds.y;
        return { ...bounds, x, y, left: x, top: y };
    };
    Object.defineProperties(element, {
        offsetWidth: { get: () => bounds.width },
        offsetHeight: { get: () => bounds.height }
    });
    const boundary = { style: { setProperty() {} }, classList: { toggle() {} } };
    const window = { mainWindowApi: fixture.api, innerWidth: 1920, innerHeight: 120, addEventListener() {} };
    const context = vm.createContext({
        window,
        document: {
            getElementById: id => id === 'miniCountdown' ? element : id === 'globalContainer' ? { children: [] } : boundary,
            querySelector: () => boundary
        },
        createMiniCountdownGlass: () => fixture.sync,
        requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
        cancelAnimationFrame: id => frames.delete(id),
        setTimeout: () => 1,
        clearTimeout() {}
    });
    const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    const inlineScript = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
    vm.runInContext(inlineScript, context);
    fixture.sync.reportInteractiveRect();
    fixture.state({ active: true });
    fixture.messages.length = 0;
    return {
        ...fixture, page: context,
        flushFrames() {
            const pending = [...frames.values()];
            frames.clear();
            pending.forEach(callback => callback());
        }
    };
}

test('unchanged countdown geometry does not send repeated IPC', () => {
    const fixture = createFixture();
    fixture.sync.reportInteractiveRect();
    fixture.sync.reportInteractiveRect();
    fixture.resize();
    assert.equal(fixture.messages.length, 1);
    assert.deepEqual(fixture.messages[0], {
        channel: 'updateInteractiveRect',
        value: { x: 100, y: 8, width: 200, height: 40, cornerRadius: 16 }
    });
});

test('black mode has no native drag IPC or extra layout measurement', () => {
    const fixture = createFixture();
    fixture.sync.reportDragPosition({ x: 20, y: 10, width: 200, height: 40 });
    assert.equal(fixture.messages.length, 0);
    assert.equal(fixture.counts.measurements, 0);
    assert.equal(fixture.classes.has('liquidGlass'), false);
});

test('native readiness controls appearance and failed state restores black', () => {
    const fixture = createFixture();
    fixture.sync.reportInteractiveRect();
    fixture.state({ active: true });
    assert.equal(fixture.classes.has('liquidGlass'), true);
    fixture.state({ active: false });
    assert.equal(fixture.classes.has('liquidGlass'), false);
    assert.equal(fixture.messages.filter(message => message.channel === 'updateInteractiveRect').length, 1);
});

test('custom glass color updates one scoped stylesheet without inline styles or repeated geometry IPC', () => {
    const fixture = createFixture();
    const style = { backgroundColor: '#1234Ab', blurSigma: 1, opacity: 0.45 };
    fixture.state({ active: false, style });
    assert.equal(fixture.styleSheet().id, 'mini-countdown-glass-style');
    assert.equal(fixture.styleSheet().textContent,
        '.miniCountdown.liquidGlass { --color-mini-glass-tint: rgba(18, 52, 171, 0.45); }');
    assert.deepEqual(fixture.element.style, { display: 'block' });
    assert.equal(fixture.messages.length, 0);
    fixture.state({ active: true, style });
    const messages = fixture.messages.length;
    const measurements = fixture.counts.measurements;
    fixture.state({ active: true, style });
    fixture.state({ active: true, style: { ...style, opacity: 0.3 } });
    assert.equal(fixture.messages.length, messages);
    assert.equal(fixture.counts.measurements, measurements);
    assert.equal(fixture.counts.styleNodes, 1);
    assert.equal(fixture.counts.styleWrites, 2);
    fixture.state({ active: false, style });
    assert.equal(fixture.classes.has('liquidGlass'), false);
});

test('invalid custom glass colors and opacity never enter the stylesheet', () => {
    const fixture = createFixture();
    for (const style of [
        { backgroundColor: '#fff', opacity: 0.3 },
        { backgroundColor: '#123456; } body { display:none', opacity: 0.3 },
        { backgroundColor: '#123456', opacity: '0.3' },
        { backgroundColor: '#123456', opacity: NaN },
        { backgroundColor: '#123456', opacity: -0.1 },
        { backgroundColor: '#123456', opacity: 1.1 }
    ]) fixture.state({ active: false, style });
    assert.equal(fixture.counts.styleNodes, 0);
    fixture.state({ active: false, style: { backgroundColor: '#000000', opacity: 0 } });
    assert.equal(fixture.counts.styleWrites, 1);
    fixture.state({ active: false, style: { backgroundColor: '#ffffff', opacity: 1 } });
    assert.equal(fixture.counts.styleWrites, 2);
});

test('glass follows drag without moving the touch overlay or reading layout', () => {
    const fixture = createFixture();
    fixture.sync.reportInteractiveRect();
    fixture.state({ active: true });
    fixture.messages.length = 0;
    fixture.counts.measurements = 0;
    fixture.sync.setDragging(true);
    const position = { x: 30, y: 20, width: 200, height: 40 };
    fixture.sync.reportDragPosition(position);
    fixture.sync.reportDragPosition(position);
    assert.deepEqual(fixture.messages, [{
        channel: 'mini-countdown-glass-rect', value: { ...position, cornerRadius: 16 }
    }]);
    assert.equal(fixture.counts.measurements, 0);
    fixture.bounds.x = 30;
    fixture.bounds.y = 20;
    fixture.sync.setDragging(false);
    fixture.sync.reportInteractiveRect();
    assert.equal(fixture.messages.at(-1).channel, 'updateInteractiveRect');
    assert.equal(fixture.messages.at(-1).value.x, 30);
});

test('font or content resize updates native dimensions without polling', () => {
    const fixture = createFixture();
    fixture.sync.reportInteractiveRect();
    fixture.bounds.width = 240;
    fixture.resize();
    assert.equal(fixture.messages.length, 2);
    assert.equal(fixture.messages.at(-1).value.width, 240);
});

test('fade-out releases the native region immediately and only once', () => {
    const fixture = createFixture();
    fixture.sync.reportInteractiveRect();
    fixture.classes.add('fade-hidden');
    fixture.sync.reportInteractiveRect();
    fixture.resize();
    assert.deepEqual(fixture.messages.at(-1), { channel: 'updateInteractiveRect', value: null });
    assert.equal(fixture.messages.length, 2);
});

test('page cleanup removes native state listener and size observer', () => {
    const fixture = createFixture();
    fixture.sync.destroy();
    assert.equal(fixture.counts.disconnected, 1);
    assert.equal(fixture.counts.unsubscribed, 1);
});

test('a queued drag frame cannot recreate glass after fade-out', () => {
    const fixture = createPageFixture();
    fixture.page.startMiniCountdownDrag(1, 100, 8);
    fixture.page.updateMiniCountdownDragPosition(140, 20);
    fixture.page.toggleElement(fixture.element, false);
    fixture.flushFrames();
    assert.equal(fixture.messages.filter(message => message.channel === 'mini-countdown-glass-rect').length, 0);
    assert.equal(fixture.messages.filter(message => message.channel === 'updateInteractiveRect').at(-1).value, null);
    fixture.page.toggleElement(fixture.element, true);
    assert.equal(fixture.page.startMiniCountdownDrag(2, 140, 20), true);
    fixture.page.finishMiniCountdownDrag(2);
});

test('local and overlay release coordinates reach native and overlay together only at drag end', () => {
    for (const overlay of [false, true]) {
        const fixture = createPageFixture();
        fixture.page.startMiniCountdownDrag(1, 100, 8);
        fixture.page.updateMiniCountdownDragPosition(120, 18);
        fixture.flushFrames();
        assert.equal(fixture.messages.filter(message => message.channel === 'updateInteractiveRect').length, 0);
        if (overlay) {
            fixture.page.handleOverlayPointerEvent({ type: 'up', pointerId: 1, clientX: 160, clientY: 28 });
        } else {
            fixture.page.handlePointerUp({ type: 'pointerup', pointerId: 1, clientX: 160, clientY: 28, preventDefault() {} });
        }
        const rect = fixture.messages.filter(message => message.channel === 'updateInteractiveRect').at(-1).value;
        assert.equal(rect.x, 160);
        assert.equal(rect.y, 28);
        fixture.flushFrames();
        assert.equal(fixture.messages.filter(message => message.channel === 'updateInteractiveRect').length, 1);
    }
});

test('pointer cancellation preserves the last queued move instead of cancellation coordinates', () => {
    const fixture = createPageFixture();
    fixture.page.startMiniCountdownDrag(1, 100, 8);
    fixture.page.updateMiniCountdownDragPosition(140, 18);
    fixture.page.handleOverlayPointerEvent({ type: 'cancel', pointerId: 1, clientX: 0, clientY: 0 });
    const rect = fixture.messages.filter(message => message.channel === 'updateInteractiveRect').at(-1).value;
    assert.equal(rect.x, 140);
    assert.equal(rect.y, 18);
});

test('drag IPC validates geometry and sender without moving the input overlay or polling', () => {
    const handlers = new Map();
    const calls = [];
    const sender = {};
    registerWindowIpc({
        ipcMain: { on: (channel, handler) => handlers.set(channel, handler) },
        windowManager: {
            getWindow: () => ({ isDestroyed: () => false, webContents: sender }),
            updateMiniCountdownGlass: rect => calls.push(rect),
            updateTouchDragOverlay: () => assert.fail('拖动帧不应移动输入覆盖窗口')
        },
        screen: { getCursorScreenPoint: () => assert.fail('拖动帧不应读取鼠标位置') },
        log: () => assert.fail('合法拖动帧不应产生日志')
    });
    const update = handlers.get('mini-countdown-glass-rect');
    const rect = { x: 12, y: 8, width: 200, height: 40, cornerRadius: 16 };
    update({ sender: {} }, rect);
    for (const invalid of [undefined, {}, { ...rect, width: 0 }, { ...rect, height: NaN }, { ...rect, cornerRadius: -1 }]) {
        update({ sender }, invalid);
    }
    assert.deepEqual(calls, []);
    update({ sender }, rect);
    update({ sender }, null);
    assert.deepEqual(calls, [rect, null]);
});

test('preload permits only the new scoped glass channels and cleans wrapped listeners', () => {
    const sent = [];
    const subscriptions = new Map();
    let facade;
    const ipcRenderer = {
        send: (...args) => sent.push(args),
        on: (channel, callback) => subscriptions.set(channel, callback),
        removeListener(channel, callback) {
            assert.equal(subscriptions.get(channel), callback);
            subscriptions.delete(channel);
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/preload/mainWindowPreload.js'), 'utf8'), {
        require: () => ({ contextBridge: { exposeInMainWorld(_name, api) { facade = api; } }, ipcRenderer })
    });
    facade.send('mini-countdown-glass-rect', null);
    assert.deepEqual(sent, [['mini-countdown-glass-rect', null]]);
    let received;
    const unsubscribe = facade.on('mini-countdown-glass-state', (...args) => { received = args; });
    const state = { active: true };
    subscriptions.get('mini-countdown-glass-state')({ sender: 'private' }, state);
    assert.deepEqual(received, [undefined, state]);
    unsubscribe();
    assert.equal(subscriptions.size, 0);
    assert.throws(() => facade.send('shutdown-native-glass'), /Unsupported/);
});
