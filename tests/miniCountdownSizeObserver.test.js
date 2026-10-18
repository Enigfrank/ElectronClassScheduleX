const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, mock } = require('node:test');

/** 创建记录文本写入次数的元素，避免把布局测量次数与文本更新混为一谈。 */
function createElement() {
    let text = '';
    let writes = 0;
    return {
        get textContent() { return text; },
        set textContent(value) { text = value; writes++; },
        get writes() { return writes; },
        addEventListener() {},
        classList: { toggle() {}, add() {}, remove() {} }
    };
}

/** 执行实际玻璃 renderer，显式触发浏览器布局观察回调。 */
function createHarness(file) {
    const elements = new Map();
    const listeners = new Map();
    const documentListeners = new Map();
    const sent = [];
    let size = { width: 260, height: 100 };
    let resizeCallback;
    const measure = mock.fn(() => size);
    const body = { getBoundingClientRect: measure, classList: { toggle() {} } };
    const api = {
        on: (channel, callback) => listeners.set(channel, callback),
        send: (channel, metrics) => sent.push({ channel, metrics }),
        invoke: async channel => channel === 'load-schedule-config'
            ? { success: true, config: { css_style: {} } } : null
    };
    const document = {
        body,
        documentElement: { style: { setProperty() {} } },
        readyState: 'loading',
        addEventListener: (name, callback) => documentListeners.set(name, callback),
        getElementById: id => {
            if (!elements.has(id)) elements.set(id, createElement());
            return elements.get(id);
        }
    };
    class FakeResizeObserver {
        /** 记录真实尺寸观察回调。 */
        constructor(callback) { resizeCallback = callback; }
        /** 验证观察 body 的含 padding 尺寸，以覆盖字体和外边界变化。 */
        observe(target, options) {
            assert.equal(target, body);
            assert.equal(options.box, 'border-box');
        }
    }
    const rendererPath = path.join(__dirname, '..', 'src', 'js', file);
    vm.runInNewContext(fs.readFileSync(rendererPath, 'utf8'), {
        window: { miniCountdownApi: api, miniCountdownHintApi: api },
        document, ResizeObserver: FakeResizeObserver, console
    }, { filename: rendererPath });
    return {
        elements, listeners, sent, measure,
        bootstrap: () => documentListeners.get('DOMContentLoaded')(),
        /** 模拟内容或字体布局变化后浏览器通知观察器。 */
        resize(width, height) {
            size = { width, height };
            resizeCallback();
        }
    };
}

for (const file of ['mini-countdown.js', 'mini-countdown-hint.js']) {
    const isHint = file.includes('hint');
    const stateChannel = isHint ? 'mini-countdown-hint-state' : 'mini-countdown-state';
    const sizeChannel = isHint ? 'mini-countdown-hint-ready' : 'mini-countdown-ready';
    test(`${file}: 首次握手、字体及内容改变尺寸时上报，同尺寸不重复发 IPC`, async () => {
        const harness = createHarness(file);
        await harness.bootstrap();
        assert.equal(harness.sent.length, 1);
        assert.equal(harness.sent[0].channel, sizeChannel);
        harness.resize(260, 100);
        assert.equal(harness.sent.length, 1);
        harness.resize(310, 100);
        assert.equal(harness.sent.length, 2);
        harness.resize(310, 110);
        assert.equal(harness.sent.length, 3);
        assert.deepEqual({ ...harness.sent[2].metrics }, { width: 310, height: 110 });
    });

    test(`${file}: 每秒内容更新不强制读取布局，相同文本不重复写 DOM`, async () => {
        const harness = createHarness(file);
        await harness.bootstrap();
        const applyState = harness.listeners.get(stateChannel);
        for (let second = 10; second < 20; second++) {
            applyState(undefined, { className: '数学', countdownText: `00:${second}`, hintName: '英语' });
        }
        assert.equal(harness.measure.mock.callCount(), 1);
        assert.equal(harness.sent.length, 1);
        const name = harness.elements.get(isHint ? 'nextClassName' : 'miniClassName');
        assert.equal(name.writes, 1);
        if (!isHint) assert.equal(harness.elements.get('miniCountdownText').writes, 10);
        applyState(undefined, null);
        assert.equal(name.writes, 1);
    });
}
