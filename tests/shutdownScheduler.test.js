const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { test, mock } = require('node:test');
const vm = require('node:vm');
const domain = require('../src/shared/shutdownWarning');

/** Load the scheduler with an allowlisted require; never load Electron or child_process. */
function createHarness(now = 100000) {
    const timers = new Map();
    const windows = [];
    const clock = { now };
    let sequence = 0;
    class ClockDate extends Date {
        /** Make both new Date() and Date.now() observe the controlled wall time. */
        constructor(...args) { super(...(args.length ? args : [clock.now])); }
        /** Return the wall time used when a warning callback actually runs. */
        static now() { return clock.now; }
    }
    class BrowserWindow extends EventEmitter {
        /** Provide only the window methods exercised by the warning lifecycle. */
        constructor(options) {
            super();
            this.options = options;
            this.destroyed = false;
            this.webContents = new EventEmitter();
            this.webContents.send = mock.fn();
            windows.push(this);
        }
        /** Report the state used by the scheduler's window guards. */
        isDestroyed() { return this.destroyed; }
        /** Accept the scheduler's always-on-top setting without a native window. */
        setAlwaysOnTop() {}
        /** Accept workspace visibility without accessing Electron. */
        setVisibleOnAllWorkspaces() {}
        /** Accept focus without opening a real window. */
        focus() {}
        /** Resolve loading while allowing tests to emit did-finish-load later. */
        loadFile() { return Promise.resolve(); }
        /** Emit the real close lifecycle used to release the plan's window. */
        destroy() { this.destroyed = true; this.emit('closed'); }
    }
    const exec = mock.fn((_command, _options, callback) => callback(null, '', ''));
    const dependencies = {
        electron: { BrowserWindow, dialog: { showMessageBox: mock.fn() } },
        child_process: { exec },
        path,
        'iconv-lite': { decode: buffer => String(buffer) },
        '../shared/shutdownWarning': domain
    };
    const module = { exports: {} };
    const filename = path.join(__dirname, '../src/modules/shutdownScheduler.js');
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
        module,
        __dirname: path.dirname(filename),
        Date: ClockDate,
        /** Reject unexpected imports instead of falling back to real process APIs. */
        require(name) {
            assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency: ${name}`);
            return dependencies[name];
        },
        /** Capture final and warning timers without starting native timers. */
        setTimeout(callback, delay) {
            const id = ++sequence;
            timers.set(id, { callback, delay, due: clock.now + delay });
            return id;
        },
        clearTimeout: id => timers.delete(id)
    }, { filename });
    const scheduler = new module.exports({}, { info() {}, warn() {}, error() {} });
    return {
        scheduler, clock, timers, windows, exec,
        /** Register a real runtime plan without exercising unrelated configuration. */
        createPlan(targetTimestamp) {
            const plan = scheduler.createPlan('00:02', new ClockDate(targetTimestamp));
            scheduler.activePlans.set(plan.id, plan);
            return plan;
        },
        /** Deliver a due callback at an explicit timestamp to model event-loop delays. */
        fire(id, timestamp) {
            const timer = timers.get(id);
            assert.ok(timer, 'timer must still be pending');
            assert.ok(timestamp >= timer.due, 'callback cannot fire before its due time');
            clock.now = timestamp;
            timers.delete(id);
            timer.callback();
        }
    };
}

test('late warning schedules final shutdown against the original deadline', () => {
    const h = createHarness();
    const plan = h.createPlan(130000);
    h.scheduler.schedulePlan(plan);
    assert.equal(h.timers.size, 1);
    assert.equal(h.timers.get(plan.warningTimer).delay, 15000);
    h.fire(plan.warningTimer, 119250);
    assert.equal(h.windows.length, 1);
    assert.equal(h.timers.size, 1);
    assert.equal(h.timers.get(plan.finalTimer).delay, 10750);
    assert.equal(h.timers.get(plan.finalTimer).due, 130000);
    assert.equal(h.exec.mock.callCount(), 1);
    assert.match(h.exec.mock.calls[0].arguments[0], /SystemSounds/);
    h.fire(plan.finalTimer, 130000);
    assert.equal(h.exec.mock.callCount(), 2);
    assert.equal(h.exec.mock.calls[1].arguments[0], 'shutdown /s /t 0');
    assert.equal(h.scheduler.activePlans.size, 0);
    assert.equal(h.timers.size, 0);
    assert.equal(h.windows[0].isDestroyed(), true);
});

test('warning delivered after the deadline clamps final timer to zero', () => {
    const h = createHarness();
    const plan = h.createPlan(130000);
    h.scheduler.schedulePlan(plan);
    h.fire(plan.warningTimer, 131500);
    assert.equal(h.timers.size, 1);
    assert.equal(h.timers.get(plan.finalTimer).delay, 0);
    h.fire(plan.finalTimer, 131500);
    assert.equal(h.exec.mock.calls.at(-1).arguments[0], 'shutdown /s /t 0');
    assert.equal(h.timers.size, 0);
});

test('init payload retains the absolute deadline even when the warning page loads late', () => {
    const h = createHarness();
    const plan = h.createPlan(130000);
    h.scheduler.showShutdownWarningWindow(plan);
    const window = h.windows[0];
    assert.equal(window.webContents.send.mock.callCount(), 0);
    h.clock.now = 123450;
    window.webContents.emit('did-finish-load');
    assert.equal(window.webContents.send.mock.callCount(), 1);
    const [channel, payload] = window.webContents.send.mock.calls[0].arguments;
    assert.equal(channel, 'shutdown-warning-init');
    assert.equal(payload.planId, plan.id);
    assert.equal(payload.targetTime, plan.targetDate.toLocaleString());
    assert.equal(payload.targetTimestamp, 130000);
    assert.equal(Number.isFinite(payload.targetTimestamp), true);
    assert.equal(h.exec.mock.callCount(), 0);
});
