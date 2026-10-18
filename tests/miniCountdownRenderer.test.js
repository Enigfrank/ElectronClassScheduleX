const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

/** 创建足以运行实际课表脚本的 DOM 元素替身。 */
function createElement() {
    const classes = new Set();
    return {
        children: [],
        style: { display: 'none' },
        textContent: '',
        classList: {
            contains: value => classes.has(value),
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            toggle: (value, enabled) => enabled ? classes.add(value) : classes.delete(value)
        },
        /** 保留实际 renderer 创建的文本节点供断言。 */
        replaceChildren(...children) {
            this.children = children;
        }
    };
}

/** 加载完整内联课表脚本，记录 IPC 并手动驱动过渡定时器。 */
function createRenderer() {
    const elements = new Map();
    const listeners = new Map();
    const sent = [];
    const timers = new Map();
    let nextTimer = 0;
    /** 取得稳定的元素实例，模拟 getElementById。 */
    function getElement(id) {
        if (!elements.has(id)) elements.set(id, createElement());
        return elements.get(id);
    }
    const document = {
        getElementById: getElement,
        querySelector: getElement,
        createElement
    };
    const context = vm.createContext({
        document,
        window: {
            mainWindowApi: {
                on: (channel, callback) => listeners.set(channel, callback),
                send: (channel, ...args) => sent.push({ channel, args })
            }
        },
        getComputedStyle: element => {
            assert.equal(element, getElement('.countdownFallback'));
            return { top: '28px' };
        },
        setTimeout: callback => {
            timers.set(++nextTimer, callback);
            return nextTimer;
        },
        clearTimeout: timer => timers.delete(timer)
    });
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    vm.runInContext(script, context, { filename: 'src/index.html:inline' });
    return { context, elements, listeners, sent, timers, getElement };
}

/** 在真实 renderer 中分发状态。 */
function dispatch(renderer, state) {
    renderer.context.testState = state;
    vm.runInContext('dispatchCountdownState(testState)', renderer.context);
}

test('故障通知立即渲染最近状态，后续 tick 保持本地倒计时且停止玻璃 IPC', () => {
    const renderer = createRenderer();
    const state = {
        visible: true, className: '<数学>', countdownText: '05:00',
        hintVisible: true, hintName: '<语文>'
    };
    dispatch(renderer, state);
    assert.equal(renderer.sent.length, 1);
    assert.equal(renderer.sent[0].channel, 'set-glass-countdown-state');
    assert.equal(renderer.getElement('miniCountdown').style.display, 'none');

    renderer.listeners.get('glass-countdown-unavailable')(undefined);
    const countdown = renderer.getElement('miniCountdown');
    const hint = renderer.getElement('nextClassHint');
    assert.equal(countdown.style.display, 'block');
    assert.equal(countdown.children[0].textContent, '<数学>');
    assert.equal(countdown.children[1].textContent, '05:00');
    assert.equal(hint.textContent, '下节: <语文>');
    assert.equal(hint.style.display, 'block');

    vm.runInContext(`
        scheduleData = { currentHighlight: {
            type: 'current', fullName: '数学', countdown: 299, countdownText: '04:59'
        } };
        activeHintName = '语文';
        setCountdownerContent();
        setCountdownerContent();
    `, renderer.context);
    assert.equal(countdown.children[1].textContent, '04:59');
    assert.equal(countdown.classList.contains('fade-hidden'), false);
    assert.equal(renderer.timers.size, 0);
    assert.equal(renderer.sent.length, 1);
});

test('降级支持仅提示、收起状态，以及状态到达前的故障通知', () => {
    const renderer = createRenderer();
    renderer.listeners.get('glass-countdown-unavailable')(undefined);
    dispatch(renderer, {
        visible: false, className: '', countdownText: '', hintVisible: true, hintName: '英语'
    });
    const hint = renderer.getElement('nextClassHint');
    assert.equal(renderer.getElement('miniCountdown').style.display, 'none');
    assert.equal(hint.style.display, 'block');
    assert.equal(renderer.sent.length, 0);

    dispatch(renderer, { visible: false, hintVisible: false, hintName: '' });
    assert.equal(hint.classList.contains('fadeOut'), true);
    for (const callback of renderer.timers.values()) callback();
    assert.equal(hint.style.display, 'none');
});

test('倒计时状态使用 renderer 解析出的顶部像素间距', () => {
    const renderer = createRenderer();
    const state = vm.runInContext('buildCountdownState(false)', renderer.context);
    assert.equal(state.topSpace, 28);
});

test('只在退出迷你模式时发送一次归位 IPC，非迷你模式持续 tick 不重复归位', () => {
    const renderer = createRenderer();
    vm.runInContext(`
        scheduleData = { currentHighlight: {
            type: 'upcoming', fullName: '数学', countdown: 300, countdownText: '05:00'
        } };
        setCountdownerContent();
        setCountdownerContent();
    `, renderer.context);
    assert.equal(renderer.sent.filter(item => item.channel === 'reset-glass-countdown-position').length, 0);
    vm.runInContext(`
        scheduleData.currentHighlight.type = 'current';
        setCountdownerContent();
        scheduleData.currentHighlight.type = 'upcoming';
        setCountdownerContent();
        setCountdownerContent();
        setCountdownerContent();
    `, renderer.context);
    assert.equal(renderer.sent.filter(item => item.channel === 'reset-glass-countdown-position').length, 1);
});

test('主课表 preload 允许故障通知，剥离 Electron 事件并正确取消订阅', async () => {
    const file = path.join(__dirname, '..', 'src', 'preload', 'mainWindowPreload.js');
    const listeners = new Map();
    const sends = [];
    const removals = [];
    let api;
    const electron = {
        contextBridge: { exposeInMainWorld: (_name, exposed) => { api = exposed; } },
        ipcRenderer: {
            on: (channel, callback) => listeners.set(channel, callback),
            removeListener: (channel, callback) => removals.push({ channel, callback }),
            send: (...args) => sends.push(args),
            invoke: async (...args) => args
        }
    };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { require: () => electron });
    const calls = [];
    const unsubscribe = api.on('glass-countdown-unavailable', (...args) => calls.push(args));
    const callback = listeners.get('glass-countdown-unavailable');
    callback({ sender: 'privileged' }, 'payload');
    assert.deepEqual(calls, [[undefined, 'payload']]);
    unsubscribe();
    assert.equal(removals[0].callback, callback);
    assert.equal(removals[0].channel, 'glass-countdown-unavailable');
    assert.throws(() => api.on('unsupported', () => {}), /Unsupported/);
    assert.throws(() => api.on('glass-countdown-unavailable', null), /must be a function/);
    assert.throws(() => api.send('glass-countdown-unavailable'), /Unsupported/);
    assert.throws(() => api.invoke('unsupported'), /Unsupported/);
    api.send('set-glass-countdown-state', { visible: true });
    assert.deepEqual(sends, [['set-glass-countdown-state', { visible: true }]]);
    assert.deepEqual(await api.invoke('load-schedule-config'), ['load-schedule-config']);
});
