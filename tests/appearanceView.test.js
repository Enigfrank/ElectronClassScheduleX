const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const guiRequire = createRequire(path.resolve(__dirname, '../ECSX-Gui/package.json'));
const { transformSync } = guiRequire('@babel/core');
const { defaults } = require('../src/shared/miniCountdownGlassStyle.json');
const viewPath = 'ECSX-Gui/src/features/appearance/AppearanceView.jsx';
const sliderPath = 'ECSX-Gui/src/components/CommitSlider.jsx';

/** 挂载真实 JSX 与 Hook 状态；只替换 Chakra 展示组件和 IPC 依赖，不生成产物。 */
function mount(relativePath, initialProps = {}, exportedName) {
    const slots = [];
    const pendingEffects = [];
    const cache = new Map();
    let cursor = 0;
    let tree;
    let props = initialProps;
    let destroyed = false;
    let lateUpdates = 0;
    const toast = () => {};
    const react = {
        __esModule: true,
        default: { createElement: (type, properties, ...children) => ({ type, props: { ...properties, children } }) },
        useState(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
            return [slots[index], value => {
                if (destroyed) lateUpdates += 1;
                slots[index] = typeof value === 'function' ? value(slots[index]) : value;
            }];
        },
        useRef(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = { current: initial };
            return slots[index];
        },
        useEffect(effect, deps) {
            const index = cursor++;
            const previous = slots[index];
            if (previous && deps?.every((value, i) => value === previous.deps?.[i])) return;
            slots[index] = { deps, cleanup: previous?.cleanup };
            pendingEffects.push(() => {
                slots[index].cleanup?.();
                slots[index].cleanup = effect();
            });
        },
    };
    const chakra = new Proxy({
        useColorModeValue: light => light,
        extendTheme: value => value,
        useColorMode: () => ({ colorMode: 'light', toggleColorMode() {} }),
        useToast: () => toast,
    }, { get: (target, key) => target[key] ?? String(key) });

    /** 通过 Babel/VM 加载实际组件及其本地样式模块。 */
    function load(filename, entry = false) {
        if (cache.has(filename)) return cache.get(filename);
        const module = { exports: {} };
        cache.set(filename, module.exports);
        const compiled = transformSync(readFileSync(filename, 'utf8'), {
            filename, configFile: false, babelrc: false,
            presets: [guiRequire.resolve('@babel/preset-react')],
            plugins: [guiRequire.resolve('@babel/plugin-transform-modules-commonjs')],
        }).code;
        vm.runInNewContext(compiled + (entry && exportedName ? `\nmodule.exports.subject = ${exportedName};` : ''), {
            module, exports: module.exports, window: { dashboardApi: initialProps.ipcRenderer },
            require(name) {
                if (name === 'react') return react;
                if (name === '@chakra-ui/react') return chakra;
                if (name === 'lucide-react') return new Proxy({}, { get: (_target, key) => String(key) });
                const target = path.resolve(path.dirname(filename), name);
                if (name.endsWith('.json')) return require(target);
                if (name.endsWith('.jsx') && !/AppearanceView|CommitSlider/.test(name)) {
                    return { __esModule: true, default: function FeatureView() {} };
                }
                return load(target);
            },
        }, { filename });
        cache.set(filename, module.exports);
        return module.exports;
    }

    const module = load(path.resolve(__dirname, '..', relativePath), true);
    const component = exportedName ? module.subject : module.default;

    /** 重渲染实际组件并执行依赖发生变化的 effect。 */
    function render(nextProps = props) {
        props = nextProps;
        cursor = 0;
        tree = component(props);
        pendingEffects.splice(0).forEach(effect => effect());
        return tree;
    }

    /** 遍历 JSX 树，按可访问名称或组件类型查询真实事件回调。 */
    function all(predicate) {
        const results = [];
        function visit(node) {
            if (Array.isArray(node)) return node.forEach(visit);
            if (!node || typeof node !== 'object') return;
            if (predicate(node)) results.push(node);
            visit(node.props.children);
        }
        visit(tree);
        return results;
    }

    render();
    return {
        render, all,
        find: predicate => {
            const node = all(predicate)[0];
            assert.ok(node, '未找到预期 JSX 控件');
            return node;
        },
        input: label => all(node => node.props['aria-label'] === label)[0],
        get lateUpdates() { return lateUpdates; },
        async flush() { await new Promise(resolve => setImmediate(resolve)); render(); },
        destroy() {
            destroyed = true;
            slots.forEach(slot => slot?.cleanup?.());
        },
    };
}

/** 创建可手动完成的请求，用于验证保存锁和卸载保护。 */
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
    return { promise, resolve, reject };
}

/** 挂载配置页并记录全部实际 IPC；缺省回执原样确认完整样式。 */
function appearance(handler, overrides = {}) {
    const calls = [];
    const ipcRenderer = {
        invoke(channel, style) {
            calls.push(style === undefined ? [channel] : [channel, JSON.parse(JSON.stringify(style))]);
            return handler ? handler(channel, style) : Promise.resolve({ success: true, style: style || defaults });
        },
    };
    return { ...mount(viewPath, { ipcRenderer, enabled: true, isTogglePending: false, onToggle() {}, ...overrides }), calls };
}

/** 向实际输入回调传递浏览器事件中的当前值。 */
function edit(harness, label, value, event = 'onChange') {
    harness.input(label).props[event]({ target: { value }, currentTarget: { value } });
    harness.render();
}

/** 找到页面提交滑块及其真实共享组件。 */
function pageSlider(harness, label) {
    return harness.find(node => node.type?.name === 'CommitSlider' && node.props.ariaLabel === label);
}

/** 提取可见文本，验证错误和加载状态确实进入 JSX。 */
function textContent(node) {
    if (Array.isArray(node)) return node.map(textContent).join('');
    if (node && typeof node === 'object') return textContent(node.props.children);
    return typeof node === 'string' ? node : '';
}

test('CommitSlider 拖动零提交，松手去重提交，外部值同步且禁用时不提交', () => {
    const committed = [];
    let props = { ariaLabel: '测试滑块', value: 1, min: 0, max: 10, step: 0.1, onCommit: value => committed.push(value) };
    const h = mount(sliderPath, props);
    const slider = () => h.find(node => node.type === 'Slider');
    slider().props.onChange(2);
    h.render();
    assert.equal(slider().props.value, 2);
    slider().props.onChange(3);
    h.render();
    assert.deepEqual(committed, []);
    slider().props.onChangeEnd(3);
    slider().props.onChangeEnd(3);
    h.render();
    assert.deepEqual(committed, [3]);
    props = { ...props, value: 5 };
    h.render(props);
    h.render();
    assert.equal(slider().props.value, 5);
    slider().props.onChangeEnd(5);
    assert.deepEqual(committed, [3]);
    h.render({ ...props, isDisabled: true });
    slider().props.onChangeEnd(6);
    assert.deepEqual(committed, [3]);
});

test('配置页加载一次；真实共享滑块拖动无 IPC，松手仅保存一次完整样式', async () => {
    const h = appearance();
    assert.equal(h.calls.length, 1);
    assert.equal(h.input('迷你倒计时液态玻璃').props.isDisabled, true);
    await h.flush();
    assert.equal(h.input('液态玻璃背景颜色').props.value, defaults.backgroundColor);
    assert.equal(h.input('液态玻璃不透明度数值').props.value, '30');
    const slider = mount(sliderPath, pageSlider(h, '液态玻璃模糊强度').props);
    const control = slider.find(node => node.type === 'Slider');
    control.props.onChange(2);
    control.props.onChange(4.2);
    slider.render();
    assert.equal(h.calls.length, 1);
    control.props.onChangeEnd(4.2);
    control.props.onChangeEnd(4.2);
    h.render();
    assert.equal(h.input('液态玻璃背景颜色').props.isDisabled, true);
    await h.flush();
    assert.deepEqual(h.calls, [
        ['get-mini-countdown-glass-style'],
        ['set-mini-countdown-glass-style', { ...defaults, blurSigma: 4.2 }],
    ]);
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '4.2');
    assert.equal(h.input('液态玻璃背景颜色').props.isDisabled, false);
    edit(h, '液态玻璃模糊强度数值', '4.2', 'onBlur');
    await h.flush();
    assert.equal(h.calls.length, 2);
});

test('原生颜色与 hex 输入仅更新草稿，失焦或回车提交并忽略相同颜色', async () => {
    const h = appearance();
    await h.flush();
    edit(h, '液态玻璃背景颜色选择器', '#123456');
    edit(h, '液态玻璃背景颜色选择器', '#abcdef');
    assert.equal(h.calls.length, 1);
    edit(h, '液态玻璃背景颜色选择器', '#abcdef', 'onBlur');
    await h.flush();
    assert.deepEqual(h.calls[1], ['set-mini-countdown-glass-style', { ...defaults, backgroundColor: '#abcdef' }]);
    edit(h, '液态玻璃背景颜色', '#');
    assert.equal(h.input('液态玻璃背景颜色').props.value, '#');
    assert.ok(h.all(node => node.props.role === 'status').some(node => textContent(node) === '未保存'));
    edit(h, '液态玻璃背景颜色', '#', 'onBlur');
    assert.equal(h.calls.length, 2);
    assert.ok(h.all(node => node.type === 'FormErrorMessage').some(node => textContent(node).includes('六位')));
    edit(h, '液态玻璃背景颜色', '#ABCDEF', 'onBlur');
    assert.equal(h.calls.length, 2);
    edit(h, '液态玻璃背景颜色', '#654321');
    let prevented = false;
    h.input('液态玻璃背景颜色').props.onKeyDown({ key: 'Enter', currentTarget: { value: '#654321' }, preventDefault() { prevented = true; } });
    edit(h, '液态玻璃背景颜色', '#654321', 'onBlur');
    await h.flush();
    assert.equal(prevented, true);
    assert.equal(h.calls.length, 3);
});

test('数字草稿保留未完成内容，越界和错误步长不提交，不透明度按整数百分比提交', async () => {
    const h = appearance();
    await h.flush();
    for (const value of ['', '.', '1.', '2.3']) {
        edit(h, '液态玻璃模糊强度数值', value);
        assert.equal(h.input('液态玻璃模糊强度数值').props.value, value);
    }
    assert.equal(h.calls.length, 1);
    for (const value of ['', '-1', '10.1', '1.05', 'Infinity']) {
        edit(h, '液态玻璃模糊强度数值', value, 'onBlur');
        assert.equal(h.calls.length, 1);
    }
    for (const value of ['101', '-1', '30.5']) {
        edit(h, '液态玻璃不透明度数值', value, 'onBlur');
        assert.equal(h.calls.length, 1);
    }
    edit(h, '液态玻璃不透明度数值', '45');
    assert.equal(h.calls.length, 1);
    edit(h, '液态玻璃不透明度数值', '45', 'onBlur');
    await h.flush();
    assert.deepEqual(h.calls[1], ['set-mini-countdown-glass-style', { ...defaults, opacity: 0.45 }]);
    pageSlider(h, '液态玻璃不透明度').props.onCommit(100);
    await h.flush();
    assert.equal(h.calls[2][1].opacity, 1);
});

test('保存失败可见且回滚；保存锁阻止并发及重复事件，后续仍可重试', async () => {
    const saving = deferred();
    const h = appearance((channel, style) => channel.startsWith('get-')
        ? Promise.resolve({ success: true, style: defaults }) : saving.promise);
    await h.flush();
    const commit = pageSlider(h, '液态玻璃模糊强度').props.onCommit;
    commit(7);
    commit(8);
    h.render();
    assert.equal(h.calls.length, 2);
    assert.equal(pageSlider(h, '液态玻璃模糊强度').props.isDisabled, true);
    assert.equal(h.input('液态玻璃背景颜色选择器').props.isDisabled, true);
    assert.equal(h.input('迷你倒计时液态玻璃').props.isDisabled, true);
    saving.resolve({ success: false, error: '原生效果应用失败' });
    await h.flush();
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '1');
    assert.match(textContent(h.find(node => node.props.role === 'alert')), /原生效果应用失败/);
    assert.equal(pageSlider(h, '液态玻璃模糊强度').props.value, 1);
    assert.equal(pageSlider(h, '液态玻璃模糊强度').props.isDisabled, false);
    pageSlider(h, '液态玻璃模糊强度').props.onCommit(7);
    await h.flush();
    assert.equal(h.calls.length, 3);
});

test('加载失败显示重试入口；重试成功使用持久化值且不额外保存', async () => {
    let attempts = 0;
    const persisted = { backgroundColor: '#ab1234', blurSigma: 3.5, opacity: 0.68 };
    const h = appearance(() => {
        attempts += 1;
        return attempts === 1 ? Promise.reject(new Error('读取失败')) : Promise.resolve({ success: true, style: persisted });
    });
    await h.flush();
    assert.match(textContent(h.find(node => node.props.role === 'alert')), /读取失败/);
    assert.equal(h.input('液态玻璃背景颜色'), undefined);
    h.find(node => node.type === 'Button' && textContent(node) === '重试加载').props.onClick();
    await h.flush();
    assert.equal(h.input('液态玻璃背景颜色').props.value, persisted.backgroundColor);
    assert.equal(h.input('液态玻璃不透明度数值').props.value, '68');
    assert.deepEqual(h.calls, [['get-mini-countdown-glass-style'], ['get-mini-countdown-glass-style']]);
});

test('无效加载回执不会进入可编辑状态，失败结果中的错误可见', async () => {
    for (const reply of [
        { success: false, error: '无法读取配置' },
        { success: true, style: { ...defaults, opacity: 2 } },
        { success: true, style: { backgroundColor: '#123456' } },
    ]) {
        const h = appearance(() => Promise.resolve(reply));
        await h.flush();
        assert.equal(h.input('液态玻璃背景颜色'), undefined);
        assert.ok(textContent(h.find(node => node.props.role === 'alert')).includes(reply.error || '样式无效'));
        assert.equal(h.calls.length, 1);
        h.destroy();
    }
});

test('保存请求抛出异常时回滚并恢复控件，成功回执使用主进程确认的值', async () => {
    let attempt = 0;
    const accepted = { ...defaults, backgroundColor: '#123456', blurSigma: 2 };
    const h = appearance((channel, style) => {
        if (channel.startsWith('get-')) return Promise.resolve({ success: true, style: defaults });
        attempt += 1;
        return attempt === 1 ? Promise.reject('IPC 请求失败') : Promise.resolve({ success: true, style: accepted });
    });
    await h.flush();
    pageSlider(h, '液态玻璃模糊强度').props.onCommit(2);
    await h.flush();
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '1');
    assert.equal(h.input('液态玻璃背景颜色').props.isDisabled, false);
    assert.match(textContent(h.find(node => node.props.role === 'alert')), /IPC 请求失败/);
    pageSlider(h, '液态玻璃模糊强度').props.onCommit(2);
    await h.flush();
    assert.equal(h.input('液态玻璃背景颜色').props.value, '#123456');
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '2');
    assert.equal(h.all(node => node.props.role === 'alert').length, 0);
});

test('恢复默认只保存样式，开关复用传入回调；默认未改变时不请求', async () => {
    let toggles = 0;
    const custom = { ...defaults, blurSigma: 8 };
    const h = appearance((_channel, style) => Promise.resolve({ success: true, style: style || custom }), { onToggle() { toggles += 1; } });
    await h.flush();
    h.input('迷你倒计时液态玻璃').props.onChange();
    assert.equal(toggles, 1);
    const reset = () => h.find(node => node.type === 'Button' && textContent(node) === '恢复默认样式');
    reset().props.onClick();
    await h.flush();
    assert.deepEqual(h.calls[1], ['set-mini-countdown-glass-style', defaults]);
    reset().props.onClick();
    await h.flush();
    assert.equal(h.calls.length, 2);
    assert.equal(toggles, 1);
});

test('加载和保存回执晚于卸载时不再更新组件状态', async () => {
    const loading = deferred();
    const h = appearance(() => loading.promise);
    h.destroy();
    loading.resolve({ success: true, style: defaults });
    await h.flush();
    assert.equal(h.lateUpdates, 0);
    const saving = deferred();
    const mounted = appearance(channel => channel.startsWith('get-') ? Promise.resolve({ success: true, style: defaults }) : saving.promise);
    await mounted.flush();
    pageSlider(mounted, '液态玻璃模糊强度').props.onCommit(2);
    mounted.destroy();
    saving.reject(new Error('保存失败'));
    await mounted.flush();
    assert.equal(mounted.lateUpdates, 0);
});

test('GUI 侧栏可进入界面配置，header 与共享开关 props 一致', async () => {
    const sent = [];
    const ipcRenderer = { invoke: async () => ({ success: false }), on: () => () => {}, send: (...args) => sent.push(args) };
    const h = mount('ECSX-Gui/src/GUI.jsx', { ipcRenderer }, 'ReactGUI');
    h.find(node => node.type === 'Button' && textContent(node) === '界面配置').props.onClick();
    h.render();
    assert.equal(textContent(h.find(node => node.type === 'Heading')), '界面配置');
    const view = () => h.find(node => node.type?.name === 'AppearanceView');
    assert.equal(view().props.enabled, false);
    assert.equal(view().props.isTogglePending, false);
    view().props.onToggle();
    h.render();
    assert.equal(view().props.enabled, true);
    assert.equal(view().props.isTogglePending, true);
    assert.deepEqual(sent, [['setMiniCountdownLiquidGlass', true]]);
    await h.flush();
    h.destroy();
});
