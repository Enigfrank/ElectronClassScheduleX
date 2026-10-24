const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const registerSettingsIpc = require('../src/modules/ipc/registerSettingsIpc');

const settingId = 'isMiniCountdownLiquidGlass';
const channel = 'setMiniCountdownLiquidGlass';
const { defaults } = require('../src/shared/miniCountdownGlassStyle.json');

/** 装配真实 Dashboard 设置回调与 Hook 状态，验证异步回执且不生成打包产物。 */
function createDashboardHarness() {
    const guiRequire = createRequire(path.resolve(__dirname, '../ECSX-Gui/package.json'));
    const { transformSync } = guiRequire('@babel/core');
    const filename = path.resolve(__dirname, '../ECSX-Gui/src/GUI.jsx');
    const compiled = transformSync(readFileSync(filename, 'utf8'), {
        filename,
        configFile: false,
        babelrc: false,
        presets: [guiRequire.resolve('@babel/preset-react')],
        plugins: [guiRequire.resolve('@babel/plugin-transform-modules-commonjs')]
    }).code;
    const state = [];
    const effects = [];
    const listeners = new Map();
    const toasts = [];
    const sent = [];
    let cursor = 0;
    let mounted = false;
    let settingsView;
    const toast = options => toasts.push(options);
    const react = {
        __esModule: true,
        default: {
            createElement(type, props) {
                if (type.name === 'SettingsView') settingsView = props;
                return null;
            }
        },
        useState(initial) {
            const index = cursor++;
            if (!(index in state)) state[index] = initial === 'main' ? 'settings' : initial;
            return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
        },
        useRef(initial) {
            const index = cursor++;
            if (!(index in state)) state[index] = { current: initial };
            return state[index];
        },
        useEffect(effect) { if (!mounted) effects.push(effect); }
    };
    const chakra = new Proxy({
        extendTheme: value => value,
        useColorMode: () => ({ colorMode: 'light' }),
        useColorModeValue: light => light,
        useToast: () => toast
    }, { get: (target, key) => target[key] ?? String(key) });
    const api = {
        on(name, callback) { listeners.set(name, callback); return () => listeners.delete(name); },
        invoke: async () => ({ success: false }),
        send: (...args) => sent.push(args)
    };
    const context = {
        module: { exports: {} },
        window: { dashboardApi: api },
        require(name) {
            if (name === 'react') return react;
            if (name === '@chakra-ui/react') return chakra;
            if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => String(key) });
            if (name.endsWith('.jsx')) return { __esModule: true, default() {} };
            assert.fail(`未提供 Dashboard 依赖替身：${name}`);
        }
    };
    context.exports = context.module.exports;
    vm.runInNewContext(`${compiled}\nmodule.exports.ReactGUI = ReactGUI;`, context, { filename });
    /** 重新执行组件，使状态变化进入实际设置回调。 */
    function render() {
        cursor = 0;
        context.module.exports.ReactGUI();
    }
    render();
    mounted = true;
    const cleanups = effects.map(effect => effect());
    return {
        toasts, sent,
        receive(name, data) { listeners.get(name)(undefined, data); render(); },
        toggle() { settingsView.handleSettingChange(settingId); render(); },
        get enabled() { return settingsView.settings[settingId]; },
        get pending() { return settingsView.miniCountdownGlassPending; },
        destroy() { cleanups.forEach(cleanup => cleanup()); }
    };
}

/**
 * 使用显式依赖替身加载 CommonJS 模块，避免访问 Electron 或原生库。
 * @param {string} relativePath 仓库内模块路径
 * @param {Record<string, unknown>} mocks 模块依赖替身
 * @returns {*} 被测模块导出
 */
function loadWithMocks(relativePath, mocks) {
    const filename = path.resolve(__dirname, '..', relativePath);
    const module = { exports: {} };
    vm.runInNewContext(readFileSync(filename, 'utf8'), {
        module,
        require(name) {
            if (name.startsWith('.')) return createRequire(filename)(name);
            assert.ok(Object.hasOwn(mocks, name), `未提供依赖替身：${name}`);
            return mocks[name];
        }
    }, { filename });
    return module.exports;
}

/**
 * 装配真实设置注册器，并记录窗口调用、持久化及回复顺序。
 * @param {boolean} accepted 窗口管理器实际接受的状态
 * @returns {{handlers: Map<string, Function>, calls: Array, event: Object, windowManager: Object}}
 */
function createSettingsHarness(accepted = true) {
    const handlers = new Map();
    const calls = [];
    const sender = {};
    const guiWindow = { webContents: sender };
    let style = { ...defaults };
    const windowManager = {
        getWindow: (name) => name === 'gui' ? guiWindow : null,
        getMiniCountdownGlassStyle: () => ({ ...style }),
        setMiniCountdownGlassStyle: value => {
            calls.push(['applyStyle', value]);
            if (accepted) style = { ...value };
            return accepted;
        },
        setMiniCountdownLiquidGlass: (enabled) => {
            calls.push(['apply', enabled]);
            return accepted;
        }
    };
    const event = {
        sender,
        reply: (replyChannel, payload) => calls.push(['reply', replyChannel, payload])
    };

    const configManager = { set: (key, value) => calls.push(['persist', key, value]) };
    registerSettingsIpc({
        ipcMain: {
            on: (name, handler) => handlers.set(name, handler),
            handle: (name, handler) => handlers.set(name, handler)
        },
        configManager,
        windowManager,
        trayManager: {},
        shutdownScheduler: {},
        autoLaunchManager: {}
    });
    return { handlers, calls, event, windowManager, configManager };
}

test('迷你倒计时液态玻璃默认关闭，保存和重置均使用现有配置存储', () => {
    const values = new Map();
    const ConfigManager = loadWithMocks('src/modules/configManager.js', {
        'electron-store': {
            default: class {
                /** 读取已保存值，不存在时使用配置默认值。 */
                get(key, fallback) {
                    return values.has(key) ? values.get(key) : fallback;
                }

                /** 保存配置值。 */
                set(key, value) {
                    values.set(key, value);
                }

                /** 删除配置值以恢复默认值。 */
                delete(key) {
                    values.delete(key);
                }
            }
        }
    });
    const configManager = new ConfigManager();
    assert.equal(configManager.get(settingId), false);
    assert.equal(configManager.getAll()[settingId], false);

    configManager.set(settingId, true);
    const reopenedConfig = new ConfigManager();
    assert.equal(reopenedConfig.getAll()[settingId], true);
    reopenedConfig.reset();
    assert.equal(reopenedConfig.get(settingId), false);
});

test('Dashboard 启用请求先应用原生效果，再保存并回写实际接受值', () => {
    const { handlers, calls, event } = createSettingsHarness(true);
    handlers.get(channel)(event, true);

    assert.deepEqual(calls, [
        ['apply', true],
        ['persist', settingId, true],
        ['reply', 'updateCheckbox', { id: settingId, checked: true }]
    ]);
});

test('不支持或应用失败时保存 false 并将 Dashboard 开关恢复关闭', () => {
    const { handlers, calls, event } = createSettingsHarness(false);
    handlers.get(channel)(event, true);

    assert.deepEqual(calls, [
        ['apply', true],
        ['persist', settingId, false],
        ['reply', 'updateCheckbox', { id: settingId, checked: false }]
    ]);
});

test('关闭请求同样应用、保存并回写 false', () => {
    const { handlers, calls, event } = createSettingsHarness(false);
    handlers.get(channel)(event, false);

    assert.deepEqual(calls, [
        ['apply', false],
        ['persist', settingId, false],
        ['reply', 'updateCheckbox', { id: settingId, checked: false }]
    ]);
});

test('非布尔请求不会应用效果、保存配置或回复', () => {
    const { handlers, calls, event } = createSettingsHarness();
    for (const value of [undefined, null, 0, 1, '', 'true', 'false', {}, [], new Boolean(true)]) {
        handlers.get(channel)(event, value);
    }
    assert.deepEqual(calls, []);
});

test('拒绝其他窗口和伪造 webContents 的设置请求', () => {
    const { handlers, calls, event } = createSettingsHarness();
    handlers.get(channel)({ ...event, sender: {} }, true);
    handlers.get(channel)({ ...event, sender: { ...event.sender } }, false);
    assert.deepEqual(calls, []);
});

test('Dashboard 窗口不存在时拒绝设置请求', () => {
    const { handlers, calls, event, windowManager } = createSettingsHarness();
    windowManager.getWindow = () => null;
    handlers.get(channel)(event, true);
    handlers.get(channel)({ ...event, sender: undefined }, true);
    assert.deepEqual(calls, []);
});

test('Dashboard 预加载仅允许发送新通道，保留回写事件隔离及清理', () => {
    let dashboardApi;
    let listener;
    const calls = [];
    loadWithMocks('src/preload/dashboardPreload.js', {
        electron: {
            contextBridge: {
                exposeInMainWorld: (name, api) => {
                    assert.equal(name, 'dashboardApi');
                    dashboardApi = api;
                }
            },
            ipcRenderer: {
                send: (...args) => calls.push(['send', ...args]),
                invoke: () => assert.fail('新设置不应使用 invoke'),
                on: (name, callback) => {
                    assert.equal(name, 'updateCheckbox');
                    listener = callback;
                },
                removeListener: (name, callback) => {
                    assert.equal(name, 'updateCheckbox');
                    assert.equal(callback, listener);
                    calls.push(['unsubscribe']);
                }
            }
        }
    });

    dashboardApi.send(channel, true);
    dashboardApi.send(channel, false);
    assert.throws(() => dashboardApi.send('setMiniCountdownLiquidGlassUnsafe', true), /Unsupported dashboard IPC send channel/);
    assert.throws(() => dashboardApi.invoke(channel, true), /Unsupported dashboard IPC invoke channel/);
    assert.throws(() => dashboardApi.on(channel, () => {}), /Unsupported dashboard IPC receive channel/);

    const payload = { id: settingId, checked: false };
    let received;
    const unsubscribe = dashboardApi.on('updateCheckbox', (...args) => { received = args; });
    listener({ sender: 'privileged' }, payload);
    assert.deepEqual(received, [undefined, payload]);
    unsubscribe();
    assert.deepEqual(calls, [['send', channel, true], ['send', channel, false], ['unsubscribe']]);
});

test('Dashboard 成功回执后的延迟原生失败仍提示，重复失败只提示一次', t => {
    const h = createDashboardHarness();
    t.after(() => h.destroy());
    h.toggle();
    h.receive('updateCheckbox', { id: settingId, checked: true });
    assert.equal(h.enabled, true);
    h.receive('updateCheckbox', { id: settingId, checked: false });
    assert.equal(h.enabled, false);
    assert.equal(h.toasts.length, 1);
    assert.equal(h.toasts[0].status, 'warning');
    h.receive('updateCheckbox', { id: settingId, checked: false });
    assert.equal(h.toasts.length, 1);
});

test('Dashboard 已保存启用状态发生异步失败时提示用户', t => {
    const h = createDashboardHarness();
    t.after(() => h.destroy());
    h.receive('init', { [settingId]: true });
    h.receive('updateCheckbox', { id: settingId, checked: false });
    assert.equal(h.enabled, false);
    assert.equal(h.toasts.length, 1);
});

test('Dashboard 主动关闭后的迟到启用回执不会触发失败提示', t => {
    const h = createDashboardHarness();
    t.after(() => h.destroy());
    h.toggle();
    h.receive('updateCheckbox', { id: settingId, checked: true });
    h.toggle();
    h.receive('updateCheckbox', { id: settingId, checked: true });
    h.receive('updateCheckbox', { id: settingId, checked: false });
    assert.equal(h.enabled, false);
    assert.equal(h.toasts.length, 0);
    assert.deepEqual(h.sent, [[channel, true], [channel, false]]);
});

test('Dashboard 等待回执期间阻止重复请求，成功和失败回执均恢复开关', t => {
    const h = createDashboardHarness();
    t.after(() => h.destroy());
    h.toggle();
    assert.equal(h.pending, true);
    h.toggle();
    assert.deepEqual(h.sent, [[channel, true]]);
    h.receive('updateCheckbox', { id: settingId, checked: true });
    assert.equal(h.pending, false);
    h.toggle();
    assert.equal(h.pending, true);
    h.toggle();
    assert.deepEqual(h.sent, [[channel, true], [channel, false]]);
    h.receive('updateCheckbox', { id: settingId, checked: false });
    assert.equal(h.pending, false);
    assert.equal(h.toasts.length, 0);
    h.toggle();
    h.receive('updateCheckbox', { id: settingId, checked: false });
    assert.equal(h.pending, false);
    assert.equal(h.toasts.length, 1);
});

test('样式 get 和 set 只允许当前 GUI sender，窗口不存在同样拒绝', () => {
    const h = createSettingsHarness();
    for (const name of ['get-mini-countdown-glass-style', 'set-mini-countdown-glass-style']) {
        for (const sender of [{}, undefined]) {
            assert.equal(h.handlers.get(name)({ ...h.event, sender }, defaults).success, false);
        }
        h.windowManager.getWindow = () => null;
        assert.equal(h.handlers.get(name)(h.event, defaults).success, false);
    }
    assert.deepEqual(h.calls, []);
});

test('样式读取默认值，写入先规范化并应用再保存，重开读取已保存样式', () => {
    const h = createSettingsHarness();
    const get = h.handlers.get('get-mini-countdown-glass-style');
    const set = h.handlers.get('set-mini-countdown-glass-style');
    assert.deepEqual(get(h.event), { success: true, style: defaults });
    const value = { backgroundColor: '#ABCDEF', blurSigma: 2.1, opacity: 0.4 };
    const style = { ...value, backgroundColor: '#abcdef' };
    assert.deepEqual(set(h.event, value), { success: true, style });
    assert.deepEqual(h.calls, [['applyStyle', style], ['persist', 'miniCountdownGlassStyle', style]]);
    assert.deepEqual(get(h.event), { success: true, style });
});

test('样式 IPC 无效输入不触发应用或存储', () => {
    const h = createSettingsHarness();
    for (const value of [null, {}, { ...defaults, backgroundColor: '#fff' },
        { ...defaults, blurSigma: NaN }, { ...defaults, blurSigma: 10.1 },
        { ...defaults, opacity: -0.1 }, { backgroundColor: '#123456', opacity: 0.3 }]) {
        assert.equal(h.handlers.get('set-mini-countdown-glass-style')(h.event, value).success, false);
    }
    assert.deepEqual(h.calls, []);
});

test('样式原生应用拒绝或异常不保存，存储异常返回失败并恢复旧样式', () => {
    const style = { ...defaults, blurSigma: 3 };
    const rejected = createSettingsHarness(false);
    assert.equal(rejected.handlers.get('set-mini-countdown-glass-style')(rejected.event, style).success, false);
    assert.deepEqual(rejected.calls, [['applyStyle', style]]);
    const h = createSettingsHarness();
    const set = h.handlers.get('set-mini-countdown-glass-style');
    const apply = h.windowManager.setMiniCountdownGlassStyle;
    h.windowManager.setMiniCountdownGlassStyle = () => { throw new Error('native failed'); };
    assert.deepEqual(set(h.event, style), { success: false, error: 'native failed' });
    assert.deepEqual(h.calls, []);
    h.windowManager.setMiniCountdownGlassStyle = apply;
    h.configManager.set = () => { throw new Error('disk full'); };
    assert.deepEqual(set(h.event, style), { success: false, error: 'disk full' });
    assert.deepEqual(h.calls, [['applyStyle', style], ['applyStyle', defaults]]);
    assert.deepEqual(h.windowManager.getMiniCountdownGlassStyle(), defaults);
});

test('样式读取异常和非 Error 存储异常仍返回失败，恢复异常不覆盖保存错误', () => {
    const h = createSettingsHarness();
    const getStyle = h.windowManager.getMiniCountdownGlassStyle;
    h.windowManager.getMiniCountdownGlassStyle = () => { throw new Error('read failed'); };
    assert.deepEqual(h.handlers.get('get-mini-countdown-glass-style')(h.event), {
        success: false, error: 'read failed'
    });
    h.windowManager.getMiniCountdownGlassStyle = getStyle;
    const apply = h.windowManager.setMiniCountdownGlassStyle;
    h.windowManager.setMiniCountdownGlassStyle = style => {
        if (style.blurSigma === defaults.blurSigma) throw new Error('rollback failed');
        return apply(style);
    };
    h.configManager.set = () => { throw 'storage failed'; };
    assert.deepEqual(h.handlers.get('set-mini-countdown-glass-style')(h.event, { ...defaults, blurSigma: 2 }), {
        success: false, error: 'storage failed'
    });
});

test('样式持久化字段缺失及损坏时回退，保存后新配置实例恢复样式', () => {
    const values = new Map();
    const ConfigManager = loadWithMocks('src/modules/configManager.js', {
        'electron-store': { default: class {
            /** 模拟持久化读取和默认值。 */
            get(key, fallback) { return values.has(key) ? values.get(key) : fallback; }
            /** 模拟写入磁盘。 */
            set(key, value) { values.set(key, value); }
            /** 模拟清除配置。 */
            delete(key) { values.delete(key); }
        } }
    });
    const config = new ConfigManager();
    assert.deepEqual(config.get('miniCountdownGlassStyle'), defaults);
    for (const value of [null, 'invalid', { backgroundColor: 'bad', blurSigma: NaN, opacity: 2 }]) {
        values.set('miniCountdownGlassStyle', value);
        assert.deepEqual(config.get('miniCountdownGlassStyle'), defaults);
    }
    config.set('miniCountdownGlassStyle', { backgroundColor: '#ABCDEF', blurSigma: 2, opacity: 0.5 });
    const reopened = new ConfigManager();
    assert.deepEqual(reopened.getAll().miniCountdownGlassStyle, {
        backgroundColor: '#abcdef', blurSigma: 2, opacity: 0.5
    });
    reopened.reset();
    assert.deepEqual(reopened.get('miniCountdownGlassStyle'), defaults);
});

test('Dashboard preload 允许两个样式 invoke，拒绝用 send 或 receive 访问', () => {
    let api;
    const calls = [];
    loadWithMocks('src/preload/dashboardPreload.js', {
        electron: {
            contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
            ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ success: true }); } }
        }
    });
    api.invoke('get-mini-countdown-glass-style');
    api.invoke('set-mini-countdown-glass-style', defaults);
    assert.deepEqual(calls, [['get-mini-countdown-glass-style'], ['set-mini-countdown-glass-style', defaults]]);
    for (const name of ['get-mini-countdown-glass-style', 'set-mini-countdown-glass-style']) {
        assert.throws(() => api.send(name), /Unsupported/);
        assert.throws(() => api.on(name, () => {}), /Unsupported/);
    }
});
