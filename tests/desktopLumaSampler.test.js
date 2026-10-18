const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test, mock } = require('node:test');

const modulePath = path.join(__dirname, '..', 'src', 'modules', 'desktopLumaSampler.js');
const source = fs.readFileSync(modulePath, 'utf8');

/** 创建可手动推进的周期计时器，记录有效句柄以验证清理和重复调度。 */
function createTimers() {
    let now = 0;
    const pending = new Map();
    return {
        pending,
        /** 注册支持 unref 的周期计时器。 */
        setInterval: mock.fn((callback, delay) => {
            const handle = { unref: mock.fn() };
            pending.set(handle, { callback, delay, time: now + delay });
            return handle;
        }),
        clearInterval: mock.fn(handle => pending.delete(handle)),
        /** 触发指定时间范围内的周期回调，不等待其中的异步截图。 */
        advance(milliseconds) {
            const end = now + milliseconds;
            for (;;) {
                const next = [...pending].filter(([, timer]) => timer.time <= end)
                    .sort((a, b) => a[1].time - b[1].time)[0];
                if (!next) break;
                const [, timer] = next;
                now = timer.time;
                timer.time += timer.delay;
                timer.callback();
            }
            now = end;
        }
    };
}

/** 创建纯色 BGRA 屏幕缩略图，运行真实邻域亮度计算。 */
function createSource(luma, displayId = '1') {
    const bitmap = Buffer.alloc(10 * 10 * 4, luma);
    return {
        display_id: displayId,
        thumbnail: {
            isEmpty: () => false,
            getSize: () => ({ width: 10, height: 10 }),
            toBitmap: () => bitmap
        }
    };
}

/** 在 VM 中加载真实采样器，截图请求由测试手动完成以复现生命周期竞态。 */
function createHarness(options = {}) {
    const timers = createTimers();
    const requests = [];
    const display = { id: 1, size: { width: 80, height: 80 }, bounds: { x: 0, y: 0 } };
    const getSources = mock.fn(captureOptions => new Promise((resolve, reject) => {
        requests.push({ resolve, reject, options: captureOptions });
    }));
    const moduleStub = { exports: {} };
    vm.runInNewContext(source, {
        module: moduleStub,
        require: name => {
            assert.equal(name, 'electron');
            return { desktopCapturer: { getSources }, screen: { getPrimaryDisplay: () => display } };
        },
        setInterval: timers.setInterval,
        clearInterval: timers.clearInterval
    }, { filename: modulePath });
    const logger = { info: mock.fn(), warn: mock.fn() };
    const sampler = new moduleStub.exports(logger, options);
    const onChange = mock.fn();
    return {
        sampler, timers, requests, getSources, onChange, logger,
        /** 返回指定截图请求的实际屏幕像素。 */
        resolve(index, luma) {
            requests[index].resolve([createSource(luma)]);
        }
    };
}

/** 等待截图、亮度计算及过期请求后的补采微任务完成。 */
async function flushSampling() {
    await new Promise(resolve => setImmediate(resolve));
}

test('构造和重复 start 保持 inactive：零截图、零周期计时器', async () => {
    const { sampler, timers, requests, onChange } = createHarness();
    assert.equal(sampler.active, false);
    sampler.setDragging(true);
    sampler.start(onChange);
    sampler.start(onChange);
    sampler.setDragging(true);
    sampler.setDragging(false);
    timers.advance(60000);
    await flushSampling();
    assert.equal(requests.length, 0);
    assert.equal(timers.pending.size, 0);
    assert.equal(timers.setInterval.mock.callCount(), 0);
    assert.equal(sampler.dragging, false);
    assert.equal(onChange.mock.callCount(), 0);
});

test('激活立即截图，并按五秒周期采样；重复激活不重建计时器或截图', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    sampler.start(onChange);
    sampler.setActive(true);
    assert.equal(requests.length, 1);
    assert.equal(timers.pending.size, 1);
    assert.equal([...timers.pending.values()][0].delay, 5000);
    const timer = sampler.timer;
    assert.equal(timer.unref.mock.callCount(), 1);
    sampler.setActive(true);
    sampler.setActive(true);
    assert.equal(requests.length, 1);
    assert.equal(sampler.timer, timer);
    assert.equal(timers.setInterval.mock.callCount(), 1);

    harness.resolve(0, 240);
    await flushSampling();
    assert.deepEqual(onChange.mock.calls.map(call => call.arguments[0]), [true]);
    timers.advance(4999);
    assert.equal(requests.length, 1);
    timers.advance(1);
    assert.equal(requests.length, 2);
    harness.resolve(1, 20);
    await flushSampling();
    timers.advance(5000);
    assert.equal(requests.length, 3);
    harness.resolve(2, 240);
    await flushSampling();
    assert.deepEqual(onChange.mock.calls.map(call => call.arguments[0]), [true, false, true]);
    sampler.stop();
});

test('先设置 active 再 start，启动前没有截图或计时器', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    sampler.setActive(true);
    sampler.setDragging(true);
    assert.equal(requests.length, 0);
    assert.equal(timers.pending.size, 0);
    sampler.start(onChange);
    assert.equal(requests.length, 1);
    assert.equal(timers.pending.size, 1);
    harness.resolve(0, 240);
    await flushSampling();
    assert.equal(onChange.mock.callCount(), 1);
    sampler.stop();
});

for (const reason of ['窗口隐藏', '考试模式抑制', '玻璃窗口 fallback']) {
    test(`${reason}通过 setActive(false) 停止周期采样并丢弃在途结果`, async () => {
        const harness = createHarness();
        const { sampler, timers, requests, onChange } = harness;
        sampler.start(onChange);
        sampler.setActive(true);
        sampler.setActive(false);
        sampler.setActive(false);
        assert.equal(timers.pending.size, 0);
        assert.equal(sampler.timer, null);
        harness.resolve(0, 240);
        await flushSampling();
        assert.equal(sampler.lastLight, null);
        assert.equal(sampler.lastLuma, null);
        assert.equal(onChange.mock.callCount(), 0);
        timers.advance(60000);
        assert.equal(requests.length, 1);

        sampler.setActive(true);
        assert.equal(requests.length, 2);
        harness.resolve(1, 20);
        await flushSampling();
        assert.deepEqual(onChange.mock.calls.map(call => call.arguments[0]), [false]);
        sampler.stop();
    });
}

test('截图 busy 时连续周期触发不会并发截图或额外补采', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    sampler.start(onChange);
    sampler.setActive(true);
    timers.advance(20000);
    assert.equal(requests.length, 1);
    harness.resolve(0, 240);
    await flushSampling();
    assert.equal(requests.length, 1);
    assert.equal(onChange.mock.callCount(), 1);
    timers.advance(5000);
    assert.equal(requests.length, 2);
    harness.resolve(1, 240);
    await flushSampling();
    assert.equal(onChange.mock.callCount(), 1);
    sampler.stop();
});

test('拖动期间无截图和计时器，松手立即补采并恢复五秒周期', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    sampler.start(onChange);
    sampler.setActive(true);
    harness.resolve(0, 240);
    await flushSampling();
    sampler.setDragging(true);
    sampler.setDragging(true);
    assert.equal(timers.pending.size, 0);
    timers.advance(60000);
    assert.equal(requests.length, 1);
    sampler.setDragging(false);
    sampler.setDragging(false);
    assert.equal(requests.length, 2);
    assert.equal(timers.pending.size, 1);
    harness.resolve(1, 20);
    await flushSampling();
    assert.deepEqual(onChange.mock.calls.map(call => call.arguments[0]), [true, false]);
    timers.advance(5000);
    assert.equal(requests.length, 3);
    sampler.stop();
    harness.resolve(2, 240);
    await flushSampling();
});

test('拖动使旧结果失效，松手等待旧截图结束再立即补采', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    sampler.start(onChange);
    sampler.setActive(true);
    sampler.setDragging(true);
    sampler.setDragging(false);
    assert.equal(requests.length, 1);
    harness.resolve(0, 240);
    await flushSampling();
    assert.equal(onChange.mock.callCount(), 0);
    assert.equal(sampler.lastLight, null);
    assert.equal(requests.length, 2);
    harness.resolve(1, 128);
    await flushSampling();
    assert.deepEqual(onChange.mock.calls.map(call => call.arguments[0]), [true]);
    assert.equal(timers.pending.size, 1);
    sampler.stop();
});

test('拖动时停用清除 dragging；停用和 stop 后的松手不会恢复调度', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    sampler.start(onChange);
    sampler.setActive(true);
    harness.resolve(0, 240);
    await flushSampling();
    sampler.setDragging(true);
    sampler.setActive(false);
    assert.equal(sampler.dragging, false);
    sampler.setDragging(false);
    sampler.setDragging(true);
    timers.advance(60000);
    assert.equal(requests.length, 1);
    assert.equal(timers.pending.size, 0);
    sampler.setActive(true);
    assert.equal(requests.length, 2);
    sampler.stop();
    sampler.setDragging(true);
    sampler.setDragging(false);
    harness.resolve(1, 20);
    await flushSampling();
    assert.equal(timers.pending.size, 0);
    assert.equal(onChange.mock.callCount(), 1);
});

test('停用再激活等待旧请求完成：旧明暗缓存不影响首次配色，也不并发截图', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    sampler.start(onChange);
    sampler.setActive(true);
    sampler.setActive(false);
    sampler.setActive(true);
    sampler.setActive(true);
    timers.advance(15000);
    assert.equal(requests.length, 1);
    harness.resolve(0, 20);
    await flushSampling();
    assert.equal(requests.length, 2);
    assert.equal(onChange.mock.callCount(), 0);
    assert.equal(sampler.lastLight, null);
    assert.equal(sampler.lastLuma, null);
    // 128 在初始阈值上应判亮；若旧暗底污染缓存，会被 144 的死区阈值压掉。
    harness.resolve(1, 128);
    await flushSampling();
    assert.deepEqual(onChange.mock.calls.map(call => call.arguments[0]), [true]);
    assert.equal(timers.pending.size, 1);
    sampler.stop();
});

test('stop 丢弃旧请求，已排队的周期回调和后续松手均无法继续采样', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    sampler.start(onChange);
    sampler.setActive(true);
    const queuedTick = [...timers.pending.values()][0].callback;
    sampler.stop();
    sampler.stop();
    sampler.setDragging(false);
    queuedTick();
    harness.resolve(0, 240);
    await flushSampling();
    timers.advance(60000);
    assert.equal(requests.length, 1);
    assert.equal(timers.pending.size, 0);
    assert.equal(onChange.mock.callCount(), 0);
    assert.equal(sampler.lastLight, null);
    assert.equal(sampler.lastLuma, null);
    assert.equal(sampler.busy, false);
});

test('重复 start 替换回调，旧截图完成后串行补采并给新回调首次配色', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    const newOnChange = mock.fn();
    sampler.start(onChange);
    sampler.setActive(true);
    sampler.start(newOnChange);
    assert.equal(requests.length, 1);
    assert.equal(timers.pending.size, 1);
    harness.resolve(0, 20);
    await flushSampling();
    assert.equal(requests.length, 2);
    assert.equal(onChange.mock.callCount(), 0);
    assert.equal(newOnChange.mock.callCount(), 0);
    harness.resolve(1, 128);
    await flushSampling();
    assert.deepEqual(newOnChange.mock.calls.map(call => call.arguments[0]), [true]);
    sampler.stop();
});

test('stop 后重新 start 和激活，旧请求不能调用新回调且不能丢失补采', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange } = harness;
    const newOnChange = mock.fn();
    sampler.start(onChange);
    sampler.setActive(true);
    sampler.stop();
    sampler.start(newOnChange);
    assert.equal(timers.pending.size, 0);
    sampler.setActive(true);
    assert.equal(requests.length, 1);
    harness.resolve(0, 20);
    await flushSampling();
    assert.equal(requests.length, 2);
    assert.equal(newOnChange.mock.callCount(), 0);
    harness.resolve(1, 128);
    await flushSampling();
    assert.equal(onChange.mock.callCount(), 0);
    assert.deepEqual(newOnChange.mock.calls.map(call => call.arguments[0]), [true]);
    sampler.stop();
});

test('旧请求拒绝后仍补采当前生命周期，正常截图失败后可在下个周期恢复', async () => {
    const harness = createHarness();
    const { sampler, timers, requests, onChange, logger } = harness;
    sampler.start(onChange);
    sampler.setActive(true);
    sampler.setActive(false);
    sampler.setActive(true);
    requests[0].reject(new Error('old capture failed'));
    await flushSampling();
    assert.equal(requests.length, 2);
    requests[1].reject(new Error('capture failed'));
    await flushSampling();
    assert.equal(sampler.busy, false);
    assert.equal(onChange.mock.callCount(), 0);
    assert.equal(logger.warn.mock.callCount(), 2);
    timers.advance(5000);
    assert.equal(requests.length, 3);
    harness.resolve(2, 240);
    await flushSampling();
    assert.deepEqual(onChange.mock.calls.map(call => call.arguments[0]), [true]);
    sampler.stop();
});
