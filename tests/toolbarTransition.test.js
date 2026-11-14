const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createToolbarTransition } = require('../src/js/toolbarTransition');

/** 用真实控制器与可控帧时钟观察样式、几何上报及拖动位置重置时机。 */
function createFixture() {
    const frames = new Map();
    const nodes = [];
    const reports = new Map();
    const history = [];
    const settled = [];
    let timestamp = 0;
    let sequence = 0;
    let reduced = false;
    const document = {};

    /** 创建保留可见性和布局信息的最小元素，transform 用于检查文字未缩放。 */
    function element(id, bounds = { x: 300, y: 8, width: 500, height: 48 }) {
        const classes = new Set();
        return {
            id, bounds, ownerDocument: document,
            style: { transform: 'translateX(-50%)' }, textContent: '',
            classList: {
                contains: name => classes.has(name),
                add: (...names) => names.forEach(name => classes.add(name)),
                remove: (...names) => names.forEach(name => classes.delete(name)),
                toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
            },
            setAttribute() {},
            getBoundingClientRect() { return { ...this.bounds }; },
            remove() { nodes.splice(nodes.indexOf(this), 1); }
        };
    }

    document.documentElement = element('root');
    document.createElement = type => element(type);
    document.head = document.body = { appendChild(node) { nodes.push(node); } };
    const container = element('globalContainer');
    const classContainer = element('classContainer');
    const countdownContainer = element('countdownContainer');
    const countdownSidebar = element('countdownSidebar');
    const countdowner = element('countdowner');
    const miniCountdown = element('miniCountdown', { x: 460, y: 8, width: 180, height: 40 });
    const elements = { container, classContainer, countdownContainer, countdownSidebar, countdowner, miniCountdown };

    /** 缓存显式背景覆盖，可直接比较 CSS 与原生的几何快照。 */
    function report(id, surface) {
        reports.set(id, surface);
        history.push({ id, surface });
    }

    const transition = createToolbarTransition({ ...elements,
        toolbarGlass: { setTransitionSurface: report, reportRects() {} },
        miniCountdownGlass: { setTransitionSurface: surface => report('miniCountdown', surface) },
        getStyle: () => ({ borderTopLeftRadius: '8px', borderTopWidth: '2px',
            getPropertyValue: () => '5px' }),
        reducedMotion: () => reduced,
        now: () => timestamp,
        requestFrame(callback) { frames.set(++sequence, callback); return sequence; },
        cancelFrame: id => frames.delete(id),
        onSettled(state) {
            settled.push(state.mode);
            if (state.mode !== 'mini') miniCountdown.style.transform = 'translateX(-50%)';
        }
    });
    return { ...elements, transition, document, nodes, frames, history, reports, settled,
        setReduced: value => { reduced = value; },
        state: (mode, extra = {}) => transition.setState({ mode, showCountdown: true, ...extra }),
        step(time) {
            timestamp = time;
            const pending = [...frames.values()];
            frames.clear();
            pending.forEach(callback => callback(time));
        },
        sheet: () => nodes.find(node => node.id === 'toolbar-transition-geometry').textContent
    };
}

/** 读取控制器写入样式表的数值 token，避免测试复制动画公式。 */
function token(h, name) {
    return Number(h.sheet().match(new RegExp(`--toolbar-${name}: ([\\d.-]+)`))[1]);
}

test('300ms收拢：侧边及课程先退场，几何连续变化，到位后目标文字淡入且不缩放', () => {
    const h = createFixture();
    h.state('full');
    assert.equal(h.frames.size, 0);
    h.state('mini');
    assert.equal(h.document.documentElement.classList.contains('toolbar-transition-running'), true);
    assert.equal(token(h, 'main-opacity'), 1);
    assert.equal(token(h, 'mini-opacity'), 0);
    h.step(70);
    assert.equal(token(h, 'main-opacity'), 0);
    assert.equal(h.reports.get('classContainer').rect.width, 500);
    h.step(150);
    const midpoint = h.reports.get('classContainer').rect;
    assert.ok(midpoint.width < 500 && midpoint.width > 180);
    assert.ok(midpoint.x > 300 && midpoint.x < 460);
    assert.equal(token(h, 'surface-width'), midpoint.width);
    assert.equal(token(h, 'mini-opacity'), 0);
    h.step(240);
    assert.equal(h.reports.get('miniCountdown').rect.width, 180);
    assert.deepEqual(h.reports.get('miniCountdown').presentation, { visible: true, durationMs: 60 });
    h.step(270);
    assert.ok(token(h, 'mini-opacity') > 0 && token(h, 'mini-opacity') < 1);
    assert.equal(h.miniCountdown.style.transform, 'translateX(-50%)');
    h.step(300);
    assert.equal(h.transition.isRunning(), false);
    assert.equal(h.frames.size, 0);
    assert.equal(h.miniCountdown.style.display, 'block');
    assert.equal(h.container.classList.contains('toolbar-main-hidden'), true);
    assert.ok([...h.reports.values()].every(value => value === null));
});

test('每秒内容tick与重复设置不重播；快速反转从当前矩形继续并清理旧帧', () => {
    const h = createFixture();
    h.state('full');
    h.state('mini');
    h.step(150);
    const current = h.reports.get('classContainer').rect;
    const calls = h.history.length;
    h.state('mini');
    assert.equal(h.history.length, calls);
    assert.equal(h.frames.size, 1);
    h.state('full');
    assert.deepEqual(h.reports.get('classContainer').rect, current);
    assert.equal(h.frames.size, 1);
    h.step(450);
    assert.equal(h.container.classList.contains('toolbar-main-hidden'), false);
    assert.equal(h.miniCountdown.style.display, 'none');
    assert.equal(h.frames.size, 0);
    h.state('full');
    assert.equal(h.frames.size, 0);
});

test('拖动后的mini先原位短退场，再在顶部展开，结束后才重置transform', () => {
    const h = createFixture();
    h.state('mini');
    h.miniCountdown.classList.add('liquidGlass');
    h.miniCountdown.bounds = { x: 100, y: 70, width: 180, height: 40 };
    h.miniCountdown.style.transform = 'translate3d(100px, 70px, 0)';
    h.state('full', { moved: true });
    h.step(35);
    assert.equal(h.reports.get('miniCountdown').rect.x, 100);
    assert.equal(h.reports.get('miniCountdown').rect.y, 70);
    assert.deepEqual(h.reports.get('miniCountdown').presentation, { visible: false, durationMs: 70 });
    assert.ok(token(h, 'surface-opacity') < 1);
    assert.equal(h.miniCountdown.style.transform, 'translate3d(100px, 70px, 0)');
    h.step(70);
    assert.equal(token(h, 'surface-opacity'), 0);
    assert.equal(h.reports.get('classContainer').rect, null);
    assert.equal(token(h, 'surface-x'), 460);
    assert.equal(token(h, 'surface-y'), 8);
    h.step(300);
    assert.equal(h.miniCountdown.style.display, 'none');
    assert.equal(h.miniCountdown.style.transform, 'translateX(-50%)');
    assert.equal(h.frames.size, 0);
});

test('未就绪目标不做隐藏预热，源玻璃保留首帧资源，到位后才创建目标', () => {
    const h = createFixture();
    h.state('full');
    h.classContainer.classList.add('liquidGlass');
    h.countdownSidebar.classList.add('liquidGlass');
    h.state('mini');
    assert.equal(h.reports.get('miniCountdown').rect, null);
    assert.ok(h.reports.get('classContainer').rect);
    assert.ok(h.reports.get('countdownSidebar').rect);
    assert.deepEqual(h.reports.get('countdownSidebar').presentation, { visible: false, durationMs: 70 });
    assert.equal(h.reports.get('countdowner').rect, null);
    h.step(200);
    assert.equal(h.reports.get('miniCountdown').rect, null);
    h.step(240);
    assert.ok(h.reports.get('miniCountdown').rect);
    assert.deepEqual(h.reports.get('miniCountdown').presentation, { visible: true, durationMs: 60 });
});

test('双向切换使用已启用的玻璃材质，不因目标尚未首帧就绪混入普通背景', () => {
    for (const [from, to] of [['full', 'mini'], ['mini', 'full']]) {
        const h = createFixture();
        h.classContainer.classList.add('liquidGlassEnabled');
        h.miniCountdown.classList.add('liquidGlassEnabled');
        h.state(from);
        h.state(to);
        for (const time of [0, 70, 150, 240, 270]) {
            h.step(time);
            assert.equal(h.sheet().includes('var(--toolbar-original-background)'), false);
            assert.equal(h.sheet().includes('var(--toolbar-mini-border)'), false);
            assert.equal(h.sheet().includes('var(--color-mini-glass-tint)'), true);
        }
        h.transition.destroy();
    }
});

test('展开中关闭倒计时立即移除文字与原生区域，再打开不重启动画', () => {
    const h = createFixture();
    h.state('mini');
    h.state('full');
    h.step(150);
    h.state('full', { showCountdown: false });
    assert.equal(h.countdownContainer.style.display, 'none');
    assert.equal(h.reports.get('countdowner').rect, null);
    h.step(270);
    assert.equal(h.countdownContainer.style.display, 'none');
    assert.equal(h.reports.get('countdowner').rect, null);
    h.state('full', { showCountdown: true });
    assert.equal(h.countdownContainer.style.display, 'block');
    assert.equal(h.reports.get('countdowner').presentation.visible, true);
    h.step(300);
    assert.equal(h.transition.isRunning(), false);
    assert.equal(h.frames.size, 0);

    const disabled = createFixture();
    disabled.state('mini');
    disabled.state('full', { showCountdown: false });
    disabled.step(270);
    assert.equal(disabled.countdownContainer.style.display, 'none');
    assert.equal(disabled.reports.get('countdowner').rect, null);
});

test('减少动态效果、避让中的切换及隐藏模式立即提交且不启动持续动画', () => {
    for (const reason of ['reduced', 'avoided', 'hidden']) {
        const h = createFixture();
        h.state('full');
        if (reason === 'reduced') h.setReduced(true);
        if (reason === 'avoided') h.document.documentElement.style.opacity = '0';
        h.state(reason === 'hidden' ? 'hidden' : 'mini');
        assert.equal(h.frames.size, 0);
        assert.equal(h.transition.isRunning(), false);
        assert.equal(h.sheet(), '');
        assert.equal(h.miniCountdown.style.display, reason === 'hidden' ? 'none' : 'block');
    }
});

test('卸载取消动画帧并移除surface与独立样式元素，后续状态更新无效', () => {
    const h = createFixture();
    h.state('full');
    h.state('mini');
    h.transition.destroy();
    assert.equal(h.frames.size, 0);
    assert.equal(h.nodes.length, 0);
    assert.equal(h.transition.isRunning(), false);
    assert.ok([...h.reports.values()].every(value => value === null));
    h.state('full');
    assert.equal(h.frames.size, 0);
});

test('真实页面tick保持计时内容更新，形态切换统一交由控制器并保留拖动位置', () => {
    const classes = new Set();
    const element = { children: [], style: {}, classList: {
        contains: name => classes.has(name), add() {}, remove() {}, toggle() {}
    } };
    const states = [];
    const textNodes = new Map();
    let textWrites = 0;
    for (const id of ['currentFullName', 'countdownText', 'miniCurrentFullName', 'miniCountdownText']) {
        let value = '';
        const node = { style: {} };
        Object.defineProperty(node, 'innerText', {
            get: () => value,
            set: next => { value = next; textWrites += 1; }
        });
        textNodes.set(id, node);
    }
    const context = vm.createContext({
        window: { mainWindowApi: { on() {}, send() {} }, addEventListener() {} },
        document: { addEventListener() {}, getElementById: id => textNodes.get(id) || element, querySelector: () => element },
        createMiniCountdownGlass: () => ({ reportInteractiveRect() {}, destroy() {} }),
        createToolbarGlass: () => ({ reportRects() {}, destroy() {} }),
        createToolbarTransition: () => ({ setState: state => states.push(state), isRunning: () => false, destroy() {} }),
        clearTimeout() {}, setTimeout() {}
    });
    const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    vm.runInContext(html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), context);
    const data = { scheduleArray: ['数学'], divider: [], currentHighlight: {
        type: 'current', index: 0, fullName: '数学', countdown: 500, countdownText: '08:20'
    } };
    context.getScheduleData = () => data;
    context.setScheduleClass = context.setCountdownerPosition = context.setSidebar = () => {};
    let resets = 0;
    context.resetMiniCountdownPosition = () => { resets += 1; };
    context.tick(true);
    assert.equal(textWrites, 4);
    context.tick();
    assert.equal(textWrites, 4);
    data.currentHighlight.countdownText = '08:19';
    context.tick();
    assert.equal(states.at(-1).mode, 'mini');
    assert.equal(textNodes.get('miniCountdownText').innerText, '08:19');
    assert.equal(textWrites, 6);
    data.currentHighlight.type = 'upcoming';
    context.tick();
    assert.equal(states.at(-1).mode, 'full');
    assert.equal(resets, 0);
});

/** 为真实页面脚本提供可分发事件的最小 DOM；释放 capture 时同步模拟捕获丢失。 */
function createInteractionSurface() {
    const listeners = new Map();
    const captures = new Set();
    const classes = new Set();
    return {
        children: [], style: { display: 'block', setProperty() {} }, innerText: '',
        offsetWidth: 100, offsetHeight: 40,
        classList: {
            add: name => classes.add(name), remove: name => classes.delete(name),
            contains: name => classes.has(name),
            /** 按显式布尔状态调用 Set 操作，保持测试事件替身无条件分支。 */
            toggle(name, enabled) {
                const operation = { true: 'add', false: 'delete' }[enabled];
                classes[operation](name);
            }
        },
        addEventListener(name, callback) {
            const handlers = listeners.get(name) ?? new Set();
            handlers.add(callback);
            listeners.set(name, handlers);
        },
        removeEventListener(name, callback) { listeners.get(name)?.delete(callback); },
        emit(type, values = {}) {
            const event = { type, currentTarget: this, pointerId: 1, isPrimary: true,
                button: 0, buttons: 1, clientX: 0, clientY: 0, preventDefault() {}, ...values };
            [...(listeners.get(type) ?? [])].forEach(callback => callback(event));
        },
        setPointerCapture: id => captures.add(id),
        hasPointerCapture: id => captures.has(id),
        releasePointerCapture(id) {
            captures.delete(id);
            this.emit('lostpointercapture', { pointerId: id });
        },
        getBoundingClientRect: () => ({ left: 100, top: 8, right: 200, bottom: 48, width: 100, height: 40 }),
        replaceChildren(...nodes) { this.children = nodes; }
    };
}

/** 用受控帧和计时器执行工具条，覆盖拖动终止和提示所有权的交错。 */
function createPageInteractionFixture(t) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const nodes = new Map();
    const frames = new Map();
    const messages = [];
    let transitionRunning = false;
    let sequence = 0;
    /** 每个页面 ID 只创建一个替身，以保留事件与内容状态。 */
    function node(id) {
        const element = nodes.get(id) ?? createInteractionSurface();
        nodes.set(id, element);
        return element;
    }
    const document = Object.assign(createInteractionSurface(), {
        getElementById: node, querySelector: () => node('root'),
        createElement: createInteractionSurface,
        createTextNode: textContent => ({ textContent })
    });
    const window = Object.assign(createInteractionSurface(), {
        innerWidth: 1920, innerHeight: 120,
        mainWindowApi: { on() {}, send: (...args) => messages.push(args) }
    });
    const context = vm.createContext({ window, document, setTimeout, clearTimeout,
        requestAnimationFrame: callback => { frames.set(++sequence, callback); return sequence; },
        cancelAnimationFrame: id => frames.delete(id),
        createMiniCountdownGlass: () => ({ reportInteractiveRect() {}, setDragging() {}, destroy() {} }),
        createToolbarGlass: () => ({ reportRects() {}, destroy() {} }),
        createToolbarTransition: () => ({ setState() {}, isRunning: () => transitionRunning, destroy() {} })
    });
    const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    vm.runInContext(html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')), context);
    const data = { scheduleArray: ['数学'], divider: [], currentHighlight: {
        type: 'current', index: 0, fullName: '数学', countdown: 600, countdownText: '10:00'
    } };
    context.getScheduleData = () => data;
    context.getNextClassInfo = () => ({ name: '语文' });
    context.setScheduleClass = context.setCountdownerPosition = context.setSidebar = () => {};
    context.initMiniCountdownDrag();
    return { context, document, window, node, frames, messages, data,
        setTransitionRunning: value => { transitionRunning = value; } };
}

test('本地拖动拒绝右键；捕获丢失保留排队位置，只结束一次且允许新指针', t => {
    const h = createPageInteractionFixture(t);
    const mini = h.node('miniCountdown');
    mini.emit('pointerdown', { button: 2 });
    assert.equal(h.messages.length, 0);
    mini.emit('pointerdown', { clientX: 110, clientY: 10 });
    mini.emit('pointermove', { clientX: 210, clientY: 30 });
    mini.releasePointerCapture(1);
    assert.deepEqual(h.messages, [['setDragState', true], ['setDragState', false]]);
    assert.equal(mini.style.transform, 'translate3d(200px, 28px, 0)');
    assert.equal(h.frames.size, 0);
    mini.emit('pointerdown', { pointerId: 2, clientX: 210, clientY: 30 });
    assert.deepEqual(h.messages.at(-1), ['setDragState', true]);
    h.window.emit('pagehide');
    assert.deepEqual(h.messages.at(-1), ['setDragState', false]);
    assert.equal(mini.hasPointerCapture(2), false);
});

test('页面隐藏和鼠标主键松开结束拖动，旧指针移动不能恢复原生拖动状态', t => {
    const h = createPageInteractionFixture(t);
    const mini = h.node('miniCountdown');
    mini.emit('pointerdown', { clientX: 110, clientY: 10 });
    h.document.hidden = true;
    h.document.emit('visibilitychange');
    mini.emit('pointermove', { clientX: 800, clientY: 100 });
    assert.deepEqual(h.messages, [['setDragState', true], ['setDragState', false]]);
    h.document.hidden = false;
    mini.emit('pointerdown', { pointerId: 2, clientX: 110, clientY: 10 });
    mini.emit('pointermove', { pointerId: 2, pointerType: 'mouse', buttons: 2 });
    assert.deepEqual(h.messages.at(-1), ['setDragState', false]);
    assert.equal(mini.hasPointerCapture(2), false);
});

test('覆盖窗口捕获丢失使用最后有效坐标，清理先于释放且下一指针可开始', () => {
    const surface = createInteractionSurface();
    const messages = [];
    const document = Object.assign(createInteractionSurface(), { body: surface });
    const window = Object.assign(createInteractionSurface(), {
        touchDragOverlayApi: { sendPointerEvent: event => messages.push({ ...event }) }
    });
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/js/touch-drag-overlay.js'), 'utf8'), { document, window });
    surface.emit('pointerdown', { button: 2 });
    assert.equal(messages.length, 0);
    surface.emit('pointerdown', { clientX: 10, clientY: 20 });
    surface.emit('pointermove', { clientX: 60, clientY: 40 });
    surface.releasePointerCapture(1);
    assert.deepEqual(messages.map(event => event.type), ['down', 'move', 'cancel']);
    assert.deepEqual(messages.at(-1), { type: 'cancel', pointerId: 1, clientX: 60, clientY: 40 });
    surface.emit('pointerdown', { pointerId: 2, clientX: 80, clientY: 30 });
    window.emit('pagehide');
    assert.equal(messages.length, 5);
    assert.deepEqual(messages.at(-1), { type: 'cancel', pointerId: 2, clientX: 80, clientY: 30 });
    assert.equal(surface.hasPointerCapture(2), false);
});

test('课程变更取消提示显示计时器并立即隐藏旧提示', t => {
    const h = createPageInteractionFixture(t);
    h.context.tick();
    assert.equal(h.node('nextClassHint').style.display, 'block');
    assert.equal(h.node('nextClassHint').classList.contains('nextClassHint-right'), true);
    assert.equal(h.node('nextClassHint').classList.contains('is-visible'), true);
    h.data.currentHighlight.fullName = '物理';
    h.data.currentHighlight.countdown = 599;
    h.context.tick();
    assert.equal(h.node('nextClassHint').style.display, 'none');
    t.mock.timers.tick(12700);
    assert.equal(h.node('nextClassHint').classList.contains('fadeOut'), false);
});

test('旧提示淡出期间切课不能隐藏新提示，新提示仍按原时长退出', t => {
    const h = createPageInteractionFixture(t);
    h.context.tick();
    t.mock.timers.tick(12500);
    assert.equal(h.node('nextClassHint').classList.contains('fadeOut'), true);
    h.data.currentHighlight.fullName = '物理';
    h.context.tick();
    t.mock.timers.tick(200);
    assert.equal(h.node('nextClassHint').style.display, 'block');
    assert.equal(h.node('nextClassHint').classList.contains('fadeOut'), false);
    t.mock.timers.tick(12300);
    assert.equal(h.node('nextClassHint').classList.contains('fadeOut'), true);
    t.mock.timers.tick(200);
    assert.equal(h.node('nextClassHint').style.display, 'none');
    assert.equal(h.node('nextClassHint').classList.contains('fadeOut'), false);
});

test('mini移动后与居中提示重叠时贴右显示，否则居中显示', t => {
    const h = createPageInteractionFixture(t);
    const mini = h.node('miniCountdown');
    mini.emit('pointerdown', { clientX: 110, clientY: 10 });
    mini.emit('pointermove', { clientX: 210, clientY: 10 });
    mini.emit('pointerup', { clientX: 210, clientY: 10 });

    h.context.tick();
    assert.equal(h.node('nextClassHint').classList.contains('nextClassHint-right'), true);

    mini.getBoundingClientRect = () => ({ left: 1800, top: 8, right: 1900, width: 100, height: 40 });
    h.data.currentHighlight.fullName = '物理';
    h.data.currentHighlight.countdown = 599;
    h.context.tick();
    h.data.currentHighlight.countdown = 600;
    h.context.tick();
    assert.equal(h.node('nextClassHint').classList.contains('nextClassHint-center'), true);
});

test('形态切换期间指针移动不会隐藏正在播放的工具条动画', t => {
    const h = createPageInteractionFixture(t);
    h.setTransitionRunning(true);
    h.context.handlePointerMove({ clientX: 150, clientY: 20 });
    assert.notEqual(h.node('root').style.opacity, '0');
});
