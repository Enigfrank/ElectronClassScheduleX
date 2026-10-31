const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createMiniCountdownGlass } = require('../src/js/miniCountdownGlass');
const { createToolbarGlass } = require('../src/js/toolbarGlass');
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
        documentElement: { style: { opacity: '1' } },
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
        send(channel, value, ...args) { messages.push({ channel, value, ...(args.length ? { args } : {}) }); },
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
        createToolbarGlass: () => ({ reportRects() {}, destroy() {} }),
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
        ':root { --color-mini-glass-tint: rgba(18, 52, 171, 0.45); }');
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
    facade.send('toolbar-glass-rect', { id: 'nextClassHint', rect: null });
    assert.deepEqual(sent[1], ['toolbar-glass-rect', { id: 'nextClassHint', rect: null }]);
    let received;
    const unsubscribe = facade.on('mini-countdown-glass-state', (...args) => { received = args; });
    const state = { active: true };
    subscriptions.get('mini-countdown-glass-state')({ sender: 'private' }, state);
    assert.deepEqual(received, [undefined, state]);
    unsubscribe();
    const unsubscribeToolbar = facade.on('toolbar-glass-state', (...args) => { received = args; });
    const toolbarState = { id: 'classContainer', active: true, style: { backgroundColor: '#123456', opacity: 0.4 } };
    subscriptions.get('toolbar-glass-state')({ sender: 'private' }, toolbarState);
    assert.deepEqual(received, [undefined, toolbarState]);
    unsubscribeToolbar();
    assert.equal(subscriptions.size, 0);
    assert.throws(() => facade.send('shutdown-native-glass'), /Unsupported/);
});

test('根节点避让期间切入 mini 保留交互矩形但禁止原生创建，恢复只上报背景', t => {
    const h = createFixture();
    const handlers = new Map();
    const glassRects = [];
    const overlayRects = [];
    const sender = {};
    registerWindowIpc({
        ipcMain: { on: (channel, handler) => handlers.set(channel, handler) },
        windowManager: {
            getWindow: () => ({ isDestroyed: () => false, webContents: sender, setIgnoreMouseEvents() {} }),
            updateMiniCountdownGlass: rect => glassRects.push(rect),
            updateTouchDragOverlay: rect => overlayRects.push(rect),
        }, screen: {}, log() {},
    });
    t.after(() => handlers.get('updateInteractiveRect')({ sender }, null));
    /** 将 renderer 消息送进真实 IPC 回调，验证视觉抑制不会改变输入覆盖窗口。 */
    function deliver() {
        for (const message of h.messages.splice(0)) {
            handlers.get(message.channel)({ sender }, message.value, ...(message.args || []));
        }
    }
    h.element.style.display = 'none';
    h.element.ownerDocument.documentElement.style.opacity = '0';
    h.sync.reportInteractiveRect();
    deliver();
    h.element.style.display = 'block';
    h.sync.reportInteractiveRect();
    deliver();
    const rect = { ...h.bounds, cornerRadius: 16 };
    assert.deepEqual(overlayRects.at(-1), rect);
    assert.ok(glassRects.every(value => value === null));
    h.sync.reportInteractiveRect();
    assert.equal(h.messages.length, 0);
    const overlays = overlayRects.length;
    h.element.ownerDocument.documentElement.style.opacity = '1';
    h.sync.reportInteractiveRect();
    assert.deepEqual(h.messages, [{ channel: 'mini-countdown-glass-rect', value: rect }]);
    deliver();
    assert.deepEqual(glassRects.at(-1), rect);
    assert.equal(overlayRects.length, overlays);
    h.sync.destroy();
});

/** 装配多区域 renderer，保留真实可见性、状态和事件合并代码。 */
function createToolbarFixture() {
    const messages = [];
    const listeners = new Map();
    const frames = new Map();
    const counts = { measurements: 0, styles: 0, disconnected: 0 };
    let frameId = 0;
    let resize;
    let mutate;
    const document = {};
    /** 创建具有独立可见性、类名和矩形的 DOM 区域替身。 */
    function createElement(parentElement = null) {
        const classes = new Set();
        return {
            ownerDocument: document, parentElement, style: {},
            computed: { display: 'block', visibility: 'visible', borderTopLeftRadius: '8px' },
            bounds: { x: 20, y: 8, width: 200, height: 40 },
            get className() { return [...classes].join(' '); },
            classList: {
                contains: value => classes.has(value),
                toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value),
            },
            getBoundingClientRect() { counts.measurements += 1; return { ...this.bounds }; },
        };
    }
    document.documentElement = createElement();
    document.body = createElement(document.documentElement);
    const container = createElement(document.body);
    const countdownParent = createElement(container);
    const elements = {
        classContainer: createElement(container), countdownSidebar: createElement(container),
        countdowner: createElement(countdownParent), nextClassHint: createElement(document.body),
    };
    const sync = createToolbarGlass({
        api: { send: (channel, payload) => messages.push({ channel, payload }),
            on: (channel, listener) => { listeners.set(channel, listener); return () => listeners.delete(channel); } },
        container, elements, getStyle: element => element.computed,
        applyStyle: () => { counts.styles += 1; },
        observeResize(callback) { resize = callback; return { observe() {}, disconnect() { counts.disconnected += 1; } }; },
        observeMutations(callback) { mutate = callback; return { observe() {}, disconnect() { counts.disconnected += 1; } }; },
        requestFrame: callback => { frames.set(++frameId, callback); return frameId; },
        cancelFrame: id => frames.delete(id),
    });
    return { sync, elements, container, countdownParent, document, messages, counts, listeners,
        resize: () => resize(), mutate: records => mutate(records),
        state: state => listeners.get('toolbar-glass-state')(undefined, state),
        flush() { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); },
    };
}

test('主课表和提示分别缓存矩形，祖先隐藏、淡出和指针避让均释放原生背景', () => {
    const h = createToolbarFixture();
    h.flush();
    assert.equal(h.messages.length, 4);
    assert.ok(h.messages.every(message => message.channel === 'toolbar-glass-rect'));
    h.sync.reportRects();
    assert.equal(h.messages.length, 4);
    h.countdownParent.classList.toggle('fade-hidden', true);
    h.elements.classContainer.computed.visibility = 'hidden';
    h.elements.nextClassHint.classList.toggle('fadeOut', true);
    h.sync.reportRects();
    assert.deepEqual(h.messages.slice(4).map(message => [message.payload.id, message.payload.rect]), [
        ['classContainer', null], ['countdowner', null], ['nextClassHint', null],
    ]);
    h.document.documentElement.style.opacity = '0';
    h.sync.reportRects();
    assert.deepEqual(h.messages.at(-1).payload, { id: 'countdownSidebar', rect: null });
    h.document.documentElement.style.opacity = '1';
    h.sync.reportRects();
    assert.equal(h.messages.at(-1).payload.id, 'countdownSidebar');
    assert.ok(h.messages.at(-1).payload.rect);
    h.sync.destroy();
});

test('区域首帧和颜色推送独立处理，样式事件不测量布局或改变其他区域状态', () => {
    const h = createToolbarFixture();
    h.flush();
    const baseline = h.counts.measurements;
    h.state({ id: 'classContainer', active: true, style: { backgroundColor: '#123456', opacity: 0.6 } });
    assert.equal(h.elements.classContainer.classList.contains('liquidGlass'), true);
    assert.equal(h.container.classList.contains('liquidGlass'), true);
    assert.equal(h.elements.nextClassHint.classList.contains('liquidGlass'), false);
    h.state({ id: 'nextClassHint', active: true });
    h.state({ id: 'classContainer', active: false });
    assert.equal(h.container.classList.contains('liquidGlass'), false);
    assert.equal(h.elements.nextClassHint.classList.contains('liquidGlass'), true);
    h.state({ id: 'nextClassHint', active: true, style: { backgroundColor: '#654321', opacity: 0.3 } });
    h.mutate([{ type: 'attributes', attributeName: 'class', oldValue: '', target: h.elements.nextClassHint }]);
    h.state({ id: '__proto__', active: true });
    h.flush();
    assert.equal(h.counts.measurements, baseline);
    assert.equal(h.messages.length, 4);
    assert.equal(h.counts.styles, 2);
    h.sync.destroy();
});

test('多次内容和尺寸变化合并一帧，上报新位置，卸载取消排队帧并清理监听', () => {
    const h = createToolbarFixture();
    h.flush();
    const baseline = h.counts.measurements;
    h.elements.countdowner.bounds.x = 240;
    h.resize();
    h.resize();
    h.mutate([{ type: 'childList' }]);
    h.flush();
    assert.equal(h.counts.measurements, baseline + 4);
    assert.equal(h.messages.length, 5);
    assert.equal(h.messages.at(-1).payload.id, 'countdowner');
    assert.equal(h.messages.at(-1).payload.rect.x, 240);
    h.resize();
    h.sync.destroy();
    h.flush();
    assert.equal(h.counts.measurements, baseline + 4);
    assert.equal(h.counts.disconnected, 2);
    assert.equal(h.listeners.size, 0);
});

test('区域移出窗口左侧或上侧时上报空矩形，避免 IPC 拒绝负坐标后遗留旧面板', () => {
    const h = createToolbarFixture();
    h.flush();
    for (const axis of ['x', 'y']) {
        h.elements.classContainer.bounds[axis] = -1;
        h.sync.reportRects();
        assert.deepEqual(h.messages.at(-1).payload, { id: 'classContainer', rect: null });
        const count = h.messages.length;
        h.sync.reportRects();
        assert.equal(h.messages.length, count);
        h.elements.classContainer.bounds[axis] = 8;
        h.sync.reportRects();
        assert.equal(h.messages.at(-1).payload.rect[axis], 8);
    }
    h.sync.destroy();
});

test('主课表玻璃 IPC 只接受已知展示区域与合法矩形，不修改交互窗口', () => {
    const handlers = new Map();
    const calls = [];
    const sender = {};
    registerWindowIpc({
        ipcMain: { on: (channel, handler) => handlers.set(channel, handler) },
        windowManager: {
            getWindow: () => ({ isDestroyed: () => false, webContents: sender }),
            updateToolbarGlass: (id, rect) => calls.push([id, rect]),
            updateTouchDragOverlay: () => assert.fail('展示区域不能改变输入覆盖窗口'),
        }, screen: {}, log() {},
    });
    const update = handlers.get('toolbar-glass-rect');
    const rect = { x: 20, y: 8, width: 200, height: 40, cornerRadius: 8 };
    for (const payload of [null, {}, { id: '__proto__', rect }, { id: 'miniCountdown', rect },
        { id: 'classContainer', rect: {} }, { id: 'classContainer', rect: { ...rect, x: -1 } },
        { id: 'classContainer', rect: { ...rect, width: 0 } },
        { id: 'classContainer', rect: { ...rect, cornerRadius: NaN } }]) update({ sender }, payload);
    update({ sender: {} }, { id: 'classContainer', rect });
    assert.deepEqual(calls, []);
    update({ sender }, { id: 'classContainer', rect });
    update({ sender }, { id: 'nextClassHint', rect: null });
    assert.deepEqual(calls, [['classContainer', rect], ['nextClassHint', null]]);
});
