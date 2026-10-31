const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const domain = require('../src/shared/shutdownWarning');

/** Keep wall time and pending callbacks independent to simulate a blocked renderer. */
function createClock(now = 100250) {
    const timers = new Map();
    let sequence = 0;
    const clock = {
        now,
        timers,
        Date: class extends Date {
            /** Return the controlled wall time without changing the host clock. */
            static now() { return clock.now; }
        },
        /** Record a one-shot timer without scheduling real work. */
        setTimeout(callback, delay) {
            const id = ++sequence;
            timers.set(id, { callback, delay, due: clock.now + delay });
            return id;
        },
        /** Remove a pending callback using the renderer's timer handle. */
        clearTimeout(id) { timers.delete(id); },
        /** Run one due callback at a chosen wall time, including late delivery. */
        fire(id, timestamp) {
            const timer = timers.get(id);
            assert.ok(timer, 'timer must still be pending');
            assert.ok(timestamp >= timer.due, 'callback cannot fire before its due time');
            clock.now = timestamp;
            timers.delete(id);
            timer.callback();
        }
    };
    return clock;
}

/** Execute the real renderer with isolated DOM, preload and timer substitutes. */
function createHarness() {
    const clock = createClock();
    const events = new Map();
    const actions = [];
    const elements = new Map();
    let init;
    let unsubscribed = 0;
    for (const id of ['countdown', 'targetTime', 'btn30', 'btn60', 'btnClose']) {
        elements.set(id, {
            textContent: '',
            /** Store DOM handlers so tests can dispatch actual registered actions. */
            addEventListener(event, callback) { events.set(`${id}:${event}`, callback); }
        });
    }
    /** Assert cleanup happens before crossing the preload boundary. */
    function recordAction(action, planId) {
        assert.equal(clock.timers.size, 0);
        actions.push({ action, planId });
    }
    const window = {
        ECSXShutdownWarning: domain,
        shutdownWarningApi: {
            /** Capture the initialization subscription and its cleanup. */
            onInit(callback) {
                init = callback;
                return () => { init = null; unsubscribed += 1; };
            },
            delay30: planId => recordAction('delay30', planId),
            delay60: planId => recordAction('delay60', planId),
            cancel: planId => recordAction('cancel', planId)
        },
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout,
        /** Fail immediately if the old page-relative interval returns. */
        setInterval() { assert.fail('countdown must use one-shot wall-clock timers'); },
        /** Capture the renderer unload handler. */
        addEventListener(event, callback) { events.set(event, callback); }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/js/shutdown-warning.js'), 'utf8'), {
        window,
        Date: clock.Date,
        document: {
            querySelector: () => elements.get('countdown'),
            getElementById: id => elements.get(id)
        }
    });
    return {
        clock, elements, actions,
        init: payload => init(payload),
        click: id => events.get(`${id}:click`)(),
        unload: () => events.get('beforeunload')(),
        unsubscribed: () => unsubscribed
    };
}

/** Read the only pending timer while asserting there are no duplicate loops. */
function onlyTimer(clock) {
    assert.equal(clock.timers.size, 1);
    const [id, timer] = [...clock.timers][0];
    return { id, ...timer };
}

/** Run the real timetable timer loop with rendering and schedule data stubbed. */
function createMiniCountdownHarness(clock) {
    const element = { children: [], addEventListener() {}, style: { setProperty() {} } };
    const window = { mainWindowApi: { on() {}, send() {} }, addEventListener() {} };
    const context = vm.createContext({
        window,
        document: { getElementById: () => element, querySelector: () => element },
        createMiniCountdownGlass: () => ({ destroy() {}, reportInteractiveRect() {} }),
        createToolbarGlass: () => ({ destroy() {}, reportRects() {} }),
        createToolbarTransition: () => ({ setState() {}, isRunning: () => false, destroy() {} }),
        Date: clock.Date,
        setTimeout: clock.setTimeout,
        clearTimeout: clock.clearTimeout
    });
    const html = fs.readFileSync(path.join(__dirname, '../src/index.html'), 'utf8');
    const inlineScript = html.slice(html.indexOf('<script>') + '<script>'.length, html.lastIndexOf('</script>'));
    vm.runInContext(inlineScript, context);
    const ticks = [];
    context.getScheduleData = () => ({});
    context.tick = () => ticks.push(clock.now);
    window.startSchedulePage({ css_style: {} });
    return ticks;
}

test('loading the warning page shows 15 without starting a timer before init', () => {
    const h = createHarness();
    assert.equal(h.elements.get('countdown').textContent, '15');
    assert.equal(h.clock.timers.size, 0);
    h.unload();
    assert.equal(h.unsubscribed(), 1);
});

test('delayed init immediately displays the real remaining seconds and target label', () => {
    const h = createHarness();
    h.clock.now = 104450;
    h.init({ planId: 'late-plan', targetTime: 'target label', targetTimestamp: 115000 });
    assert.equal(h.elements.get('countdown').textContent, '11');
    assert.equal(h.elements.get('targetTime').textContent, 'target label');
    assert.equal(onlyTimer(h.clock).delay, 550);
});

test('warning and miniCountdown refresh on the same system second, including exact seconds', () => {
    const h = createHarness();
    h.init({ targetTimestamp: 115000 });
    const miniClock = createClock(h.clock.now);
    const ticks = createMiniCountdownHarness(miniClock);
    assert.equal(h.elements.get('countdown').textContent, '15');
    assert.equal(onlyTimer(h.clock).delay, 750);
    assert.equal(onlyTimer(miniClock).delay, 750);
    h.clock.fire(onlyTimer(h.clock).id, 101000);
    miniClock.fire(onlyTimer(miniClock).id, 101000);
    assert.equal(h.elements.get('countdown').textContent, '14');
    assert.deepEqual(ticks, [100250, 101000]);
    assert.equal(onlyTimer(h.clock).due, 102000);
    assert.equal(onlyTimer(miniClock).due, 102000);
    h.clock.now = 102000;
    h.init({ targetTimestamp: 115000 });
    assert.equal(onlyTimer(h.clock).delay, 1000);
});

test('a stalled renderer catches up using the deadline and realigns the next callback', () => {
    const h = createHarness();
    h.init({ targetTimestamp: 115000 });
    h.clock.fire(onlyTimer(h.clock).id, 107450);
    assert.equal(h.elements.get('countdown').textContent, '8');
    assert.equal(onlyTimer(h.clock).delay, 550);
    assert.equal(onlyTimer(h.clock).due, 108000);
});

test('reinitialization replaces the old timer, deadline and action plan id', () => {
    const h = createHarness();
    h.init({ planId: 'old-plan', targetTimestamp: 115000 });
    const previous = onlyTimer(h.clock).id;
    h.clock.now = 104450;
    h.init({ planId: 'new-plan', targetTime: 'new label', targetTimestamp: 120000 });
    assert.equal(h.clock.timers.has(previous), false);
    assert.equal(h.elements.get('countdown').textContent, '16');
    assert.equal(h.elements.get('targetTime').textContent, 'new label');
    assert.equal(onlyTimer(h.clock).delay, 550);
    h.click('btn30');
    assert.deepEqual(h.actions, [{ action: 'delay30', planId: 'new-plan' }]);
});

test('missing or non-finite deadline never starts a countdown', () => {
    for (const targetTimestamp of [undefined, null, NaN, Infinity, -Infinity, '115000']) {
        const h = createHarness();
        h.init({ targetTimestamp });
        assert.equal(h.clock.timers.size, 0);
        assert.equal(h.elements.get('countdown').textContent, '15');
    }
});

test('reaching or passing zero displays zero and stops scheduling', () => {
    for (const timestamp of [115000, 119450]) {
        const h = createHarness();
        h.init({ targetTimestamp: 115000 });
        h.clock.fire(onlyTimer(h.clock).id, timestamp);
        assert.equal(h.elements.get('countdown').textContent, '0');
        assert.equal(h.clock.timers.size, 0);
        assert.deepEqual(h.actions, []);
    }
});

test('an already expired init clears any previous timer without showing negative seconds', () => {
    for (const targetTimestamp of [100250, 99000]) {
        const h = createHarness();
        h.init({ targetTimestamp: 115000 });
        h.init({ targetTimestamp });
        assert.equal(h.elements.get('countdown').textContent, '0');
        assert.equal(h.clock.timers.size, 0);
    }
});

for (const [button, action] of [['btn30', 'delay30'], ['btn60', 'delay60'], ['btnClose', 'cancel']]) {
    test(`${action} clears the countdown before sending the scoped action`, () => {
        const h = createHarness();
        h.init({ planId: 'current-plan', targetTimestamp: 115000 });
        onlyTimer(h.clock);
        h.click(button);
        assert.equal(h.clock.timers.size, 0);
        assert.deepEqual(h.actions, [{ action, planId: 'current-plan' }]);
        h.unload();
        assert.equal(h.unsubscribed(), 1);
    });
}

test('unloading clears the timer and removes the initialization subscription', () => {
    const h = createHarness();
    h.init({ targetTimestamp: 115000 });
    onlyTimer(h.clock);
    h.unload();
    assert.equal(h.clock.timers.size, 0);
    assert.equal(h.unsubscribed(), 1);
    assert.deepEqual(h.actions, []);
});
