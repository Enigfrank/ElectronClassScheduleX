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
const previewPath = 'ECSX-Gui/src/features/appearance/AppearancePreview.jsx';

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
                if (name.endsWith('.css')) return {};
                if (name.endsWith('.jsx') && !/AppearanceView|AppearancePreview|CommitSlider/.test(name)) {
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
        /** 遍历子节点，不执行被测试组件之外的 Hook。 */
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
        /** 合并父组件传入的新属性，保留其他依赖。 */
        updateProps(nextProps) { return render({ ...props, ...nextProps }); },
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
    return { ...mount(viewPath, { ipcRenderer, enabled: true, isTogglePending: false, onToggle() {},
        globalEnabled: false, isGlobalTogglePending: false, onGlobalToggle() {}, ...overrides }), calls };
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

/** 按按钮可见文案取实际事件处理函数。 */
function button(harness, label) {
    return harness.find(node => node.type === 'Button' && textContent(node) === label);
}

/** 获取传给实际模拟组件的参数，验证预览与草稿的数据流。 */
function previewProps(harness) {
    return harness.find(node => node.type?.name === 'AppearancePreview').props;
}

test('加载一次；滑块拖动和松手仅改草稿，显式保存才发送完整对象', async () => {
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
    assert.equal(h.calls.length, 1);
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '4.2');
    assert.equal(previewProps(h).styleValue.blurSigma, 4.2);
    assert.equal(h.input('液态玻璃背景颜色').props.isDisabled, false);
    button(h, '保存并应用').props.onClick();
    h.render();
    assert.equal(h.input('液态玻璃背景颜色').props.isDisabled, true);
    await h.flush();
    assert.deepEqual(h.calls, [
        ['get-mini-countdown-glass-style'],
        ['set-mini-countdown-glass-style', { ...defaults, blurSigma: 4.2 }],
    ]);
    assert.equal(button(h, '保存并应用').props.isDisabled, true);
    assert.ok(h.all(node => node.props.role === 'status').some(node => textContent(node).includes('主进程已确认')));
});

test('调色、失焦、回车都不保存；显式保存合并所有草稿并转换百分比', async () => {
    const h = appearance();
    await h.flush();
    edit(h, '液态玻璃背景颜色选择器', '#123456');
    edit(h, '液态玻璃背景颜色选择器', '#abcdef');
    edit(h, '液态玻璃背景颜色选择器', '#abcdef', 'onBlur');
    edit(h, '液态玻璃背景颜色', '#654321');
    let prevented = false;
    h.input('液态玻璃背景颜色').props.onKeyDown({
        key: 'Enter', currentTarget: { value: '#654321' }, preventDefault() { prevented = true; },
    });
    h.render();
    edit(h, '液态玻璃背景颜色', '#654321', 'onBlur');
    edit(h, '液态玻璃模糊强度数值', '2.3');
    edit(h, '液态玻璃模糊强度数值', '2.3', 'onBlur');
    edit(h, '液态玻璃不透明度数值', '45');
    edit(h, '液态玻璃不透明度数值', '45', 'onBlur');
    assert.equal(prevented, true);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(previewProps(h).styleValue)),
        { backgroundColor: '#654321', blurSigma: 2.3, opacity: 0.45 });
    button(h, '保存并应用').props.onClick();
    await h.flush();
    assert.deepEqual(h.calls[1], ['set-mini-countdown-glass-style',
        { backgroundColor: '#654321', blurSigma: 2.3, opacity: 0.45 }]);
    button(h, '保存并应用').props.onClick();
    await h.flush();
    assert.equal(h.calls.length, 2);
});

test('同一事件轮内编辑后点击旧回调，保存仍读取最新草稿', async () => {
    const h = appearance();
    await h.flush();
    const save = button(h, '保存并应用').props.onClick;
    h.input('液态玻璃背景颜色').props.onChange({ target: { value: '#ABCDEF' } });
    h.input('液态玻璃模糊强度数值').props.onBlur({ currentTarget: { value: '6.1' } });
    h.input('液态玻璃不透明度数值').props.onChange({ target: { value: '79' } });
    save();
    await h.flush();
    assert.deepEqual(h.calls[1], ['set-mini-countdown-glass-style',
        { backgroundColor: '#abcdef', blurSigma: 6.1, opacity: 0.79 }]);
});

test('无效颜色、数值、范围或步长阻止完整保存，草稿与错误保留', async () => {
    const h = appearance();
    await h.flush();
    for (const value of ['', '.', '1.', '2.3']) {
        edit(h, '液态玻璃模糊强度数值', value);
        assert.equal(h.input('液态玻璃模糊强度数值').props.value, value);
    }
    const cases = [
        ['液态玻璃背景颜色', '#'],
        ...['', '.', '-1', '10.1', '1.05', 'Infinity'].map(value => ['液态玻璃模糊强度数值', value]),
        ...['101', '-1', '30.5'].map(value => ['液态玻璃不透明度数值', value]),
    ];
    for (const [label, value] of cases) {
        button(h, '恢复默认样式').props.onClick();
        h.render();
        edit(h, label, value);
        button(h, '保存并应用').props.onClick();
        h.render();
        assert.equal(h.calls.length, 1);
        assert.equal(h.input(label).props.value, value);
        assert.equal(previewProps(h).hasInvalidDraft, true);
        assert.ok(h.all(node => node.type === 'FormErrorMessage').some(node => textContent(node).length > 0));
    }
    edit(h, '液态玻璃背景颜色', '#');
    pageSlider(h, '液态玻璃模糊强度').props.onCommit(10);
    pageSlider(h, '液态玻璃不透明度').props.onCommit(100);
    h.render();
    button(h, '保存并应用').props.onClick();
    assert.equal(h.calls.length, 1, '有效滑块不能绕过另一个无效字段');
    edit(h, '液态玻璃背景颜色', '#123456');
    button(h, '保存并应用').props.onClick();
    await h.flush();
    assert.deepEqual(h.calls[1][1], { backgroundColor: '#123456', blurSigma: 10, opacity: 1 });
});

test('所有模板和恢复默认仅改预览，关闭状态不被启用，保存时才提交', async () => {
    let miniToggles = 0;
    let globalToggles = 0;
    const h = appearance((_channel, style) => Promise.resolve({ success: true, style: style || { ...defaults, blurSigma: 8 } }), {
        enabled: false, globalEnabled: false,
        onToggle() { miniToggles += 1; }, onGlobalToggle() { globalToggles += 1; },
    });
    await h.flush();
    const values = new Set();
    for (const label of ['中性深灰', '冷灰', '暖灰', '浓灰']) {
        button(h, label).props.onClick();
        h.render();
        assert.equal(button(h, label).props['aria-pressed'], true);
        values.add(JSON.stringify(previewProps(h).styleValue));
        assert.equal(h.calls.length, 1);
        assert.equal(h.input('迷你倒计时液态玻璃').props.isChecked, false);
        assert.equal(h.input('主课表液态玻璃').props.isChecked, false);
    }
    assert.equal(values.size, 4);
    button(h, '恢复默认样式').props.onClick();
    h.render();
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '1');
    assert.equal(h.calls.length, 1);
    button(h, '保存并应用').props.onClick();
    await h.flush();
    assert.deepEqual(h.calls[1], ['set-mini-countdown-glass-style', defaults]);
    button(h, '恢复默认样式').props.onClick();
    h.render();
    button(h, '保存并应用').props.onClick();
    assert.equal(h.calls.length, 2);
    assert.equal(miniToggles + globalToggles, 0);
});

test('保存锁阻止并发与草稿覆盖，失败保留完整草稿且可直接重试', async () => {
    const saving = deferred();
    let attempts = 0;
    const h = appearance((channel, style) => {
        if (channel.startsWith('get-')) return Promise.resolve({ success: true, style: defaults });
        attempts += 1;
        return attempts === 1 ? saving.promise : Promise.resolve({ success: true, style });
    });
    await h.flush();
    edit(h, '液态玻璃背景颜色', '#123456');
    pageSlider(h, '液态玻璃模糊强度').props.onCommit(7);
    h.render();
    const save = button(h, '保存并应用').props.onClick;
    const change = h.input('液态玻璃背景颜色').props.onChange;
    const template = button(h, '冷灰').props.onClick;
    const commit = pageSlider(h, '液态玻璃模糊强度').props.onCommit;
    save();
    save();
    change({ target: { value: '#ffffff' } });
    template();
    commit(8);
    h.render();
    assert.equal(h.calls.length, 2);
    assert.equal(pageSlider(h, '液态玻璃模糊强度').props.isDisabled, true);
    assert.equal(h.input('主课表液态玻璃').props.isDisabled, true);
    assert.equal(h.input('迷你倒计时液态玻璃').props.isDisabled, true);
    assert.ok(h.all(node => node.props.role === 'status').some(node => textContent(node).includes('等待主进程确认')));
    saving.resolve({ success: false, error: '原生效果应用失败' });
    await h.flush();
    assert.equal(h.input('液态玻璃背景颜色').props.value, '#123456');
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '7');
    assert.equal(pageSlider(h, '液态玻璃模糊强度').props.value, 7);
    assert.match(textContent(h.find(node => node.props.role === 'alert')), /草稿已保留.*原生效果应用失败/);
    assert.equal(button(h, '保存并应用').props.isDisabled, false);
    button(h, '保存并应用').props.onClick();
    await h.flush();
    assert.deepEqual(h.calls[2], h.calls[1]);
    assert.equal(h.all(node => node.props.role === 'alert').length, 0);
});

test('异常或无效保存回执保留草稿，成功后采用主进程确认的值', async () => {
    const accepted = { ...defaults, backgroundColor: '#123456', blurSigma: 2 };
    const replies = [
        () => Promise.reject('IPC 请求失败'),
        () => Promise.resolve({ success: true, style: { ...defaults, opacity: 2 } }),
        () => Promise.resolve({ success: true, style: accepted }),
    ];
    const h = appearance(channel => channel.startsWith('get-')
        ? Promise.resolve({ success: true, style: defaults }) : replies.shift()());
    await h.flush();
    pageSlider(h, '液态玻璃模糊强度').props.onCommit(3);
    h.render();
    for (const message of [/IPC 请求失败/, /样式无效/]) {
        button(h, '保存并应用').props.onClick();
        await h.flush();
        assert.equal(h.input('液态玻璃模糊强度数值').props.value, '3');
        assert.equal(h.input('液态玻璃背景颜色').props.isDisabled, false);
        assert.match(textContent(h.find(node => node.props.role === 'alert')), message);
    }
    button(h, '保存并应用').props.onClick();
    await h.flush();
    assert.equal(h.input('液态玻璃背景颜色').props.value, '#123456');
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '2');
    assert.equal(button(h, '保存并应用').props.isDisabled, true);
    assert.equal(h.all(node => node.props.role === 'alert').length, 0);
});

test('加载失败可重试；成功使用持久化值，不额外保存', async () => {
    let attempts = 0;
    const persisted = { backgroundColor: '#ab1234', blurSigma: 3.5, opacity: 0.68 };
    const h = appearance(() => {
        attempts += 1;
        return attempts === 1 ? Promise.reject(new Error('读取失败')) : Promise.resolve({ success: true, style: persisted });
    });
    await h.flush();
    assert.match(textContent(h.find(node => node.props.role === 'alert')), /读取失败/);
    assert.equal(h.input('液态玻璃背景颜色'), undefined);
    button(h, '重试加载').props.onClick();
    await h.flush();
    assert.equal(h.input('液态玻璃背景颜色').props.value, persisted.backgroundColor);
    assert.equal(h.input('液态玻璃不透明度数值').props.value, '68');
    assert.deepEqual(h.calls, [['get-mini-countdown-glass-style'], ['get-mini-countdown-glass-style']]);
});

test('无效加载回执不会进入可编辑状态', async () => {
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

test('主课表和迷你开关复用各自实时回调与 pending，修改草稿不触发开关', async () => {
    const events = [];
    const h = appearance(undefined, {
        enabled: false, globalEnabled: true,
        onToggle: event => events.push(['mini', event]),
        onGlobalToggle: event => events.push(['global', event]),
    });
    await h.flush();
    const miniEvent = { target: { checked: true } };
    const globalEvent = { target: { checked: false } };
    assert.equal(h.input('迷你倒计时液态玻璃').props.isChecked, false);
    assert.equal(h.input('主课表液态玻璃').props.isChecked, true);
    h.input('迷你倒计时液态玻璃').props.onChange(miniEvent);
    h.input('主课表液态玻璃').props.onChange(globalEvent);
    assert.deepEqual(events, [['mini', miniEvent], ['global', globalEvent]]);
    h.updateProps({ isGlobalTogglePending: true, isTogglePending: false });
    assert.equal(h.input('主课表液态玻璃').props.isDisabled, true);
    assert.equal(h.input('迷你倒计时液态玻璃').props.isDisabled, false);
    h.updateProps({ isGlobalTogglePending: false, isTogglePending: true });
    assert.equal(h.input('主课表液态玻璃').props.isDisabled, false);
    assert.equal(h.input('迷你倒计时液态玻璃').props.isDisabled, true);
    edit(h, '液态玻璃背景颜色', '#123456');
    assert.equal(events.length, 2);
    assert.equal(h.calls.length, 1);
    assert.equal(previewProps(h).enabled, false);
    assert.equal(previewProps(h).globalEnabled, true);
});

test('加载或保存回执晚于卸载时不更新状态，旧控件回调也不能发请求', async () => {
    const loading = deferred();
    const h = appearance(() => loading.promise);
    h.destroy();
    loading.resolve({ success: true, style: defaults });
    await h.flush();
    assert.equal(h.lateUpdates, 0);
    for (const rejectSave of [true, false]) {
        const saving = deferred();
        const mounted = appearance(channel => channel.startsWith('get-')
            ? Promise.resolve({ success: true, style: defaults }) : saving.promise);
        await mounted.flush();
        pageSlider(mounted, '液态玻璃模糊强度').props.onCommit(2);
        mounted.render();
        const save = button(mounted, '保存并应用').props.onClick;
        const choose = button(mounted, '冷灰').props.onClick;
        const commit = pageSlider(mounted, '液态玻璃模糊强度').props.onCommit;
        save();
        mounted.destroy();
        if (rejectSave) saving.reject(new Error('保存失败'));
        else saving.resolve({ success: true, style: defaults });
        await mounted.flush();
        save();
        choose();
        commit(4);
        assert.equal(mounted.lateUpdates, 0);
        assert.equal(mounted.calls.length, 2);
    }
});

test('IPC 依赖切换时忽略旧生命周期回执，使用新来源加载的样式', async () => {
    const oldLoad = deferred();
    const h = appearance(() => oldLoad.promise);
    const next = { ...defaults, blurSigma: 8 };
    const calls = [];
    h.updateProps({ ipcRenderer: { invoke: async channel => { calls.push(channel); return { success: true, style: next }; } } });
    await h.flush();
    oldLoad.resolve({ success: true, style: defaults });
    await h.flush();
    assert.equal(h.input('液态玻璃模糊强度数值').props.value, '8');
    assert.deepEqual(calls, ['get-mini-countdown-glass-style']);
});

test('模拟区模式与背景独立；下节课提示始终跟随迷你模式，主课表独立', () => {
    const h = mount(previewPath, { styleValue: defaults, enabled: false, globalEnabled: false });
    const regions = () => h.all(node => node.props['data-region']).map(node => [node.props['data-region'], node.props['data-glass']]);
    assert.equal(h.input('主课表演示模式').props.value, 'glass');
    assert.equal(h.input('迷你倒计时演示模式').props.value, 'glass');
    assert.deepEqual(regions(), [['globalContainer', true], ['miniCountdown', true], ['nextClassHint', true]]);
    const mini = h.find(node => node.props['data-region'] === 'miniCountdown');
    assert.equal(textContent(mini), '数学08:24');
    assert.equal(textContent(h.find(node => node.props['data-region'] === 'nextClassHint')), '下节: 语文');
    assert.equal(textContent(mini.props.children.find(node => node.props?.className === 'appearance-preview-current-class')), '数学');
    h.updateProps({ globalEnabled: true });
    edit(h, '主课表演示模式', 'current');
    edit(h, '迷你倒计时演示模式', 'current');
    assert.deepEqual(regions(), [['globalContainer', true], ['miniCountdown', false], ['nextClassHint', false]]);
    edit(h, '主课表演示模式', 'plain');
    edit(h, '迷你倒计时演示模式', 'glass');
    assert.deepEqual(regions(), [['globalContainer', false], ['miniCountdown', true], ['nextClassHint', true]]);
    h.updateProps({ enabled: true, globalEnabled: false });
    assert.deepEqual(regions(), [['globalContainer', false], ['miniCountdown', true], ['nextClassHint', true]]);
    edit(h, '迷你倒计时演示模式', 'plain');
    assert.deepEqual(regions(), [['globalContainer', false], ['miniCountdown', false], ['nextClassHint', false]]);
    edit(h, '主课表演示模式', 'glass');
    assert.deepEqual(regions(), [['globalContainer', true], ['miniCountdown', false], ['nextClassHint', false]]);
    edit(h, '主课表演示模式', 'current');
    edit(h, '迷你倒计时演示模式', 'current');
    assert.deepEqual(regions(), [['globalContainer', false], ['miniCountdown', true], ['nextClassHint', true]]);
    for (const value of ['light', 'contrast', 'detail']) {
        edit(h, '演示背景', value);
        assert.equal(h.find(node => node.props['data-background']).props['data-background'], value);
    }
    assert.match(textContent(h.find(node => node.props['aria-label'] === '液态玻璃模拟演示')), /仅演示设置.*原生玻璃.*可能不同/);
});

test('草稿颜色、透明度与模糊进入 CSS 变量；无效字段回退并明确标注', async () => {
    const h = appearance();
    await h.flush();
    edit(h, '液态玻璃背景颜色', '#102030');
    pageSlider(h, '液态玻璃模糊强度').props.onCommit(5.2);
    pageSlider(h, '液态玻璃不透明度').props.onCommit(61);
    h.render();
    const p = mount(previewPath, previewProps(h));
    assert.match(textContent(p.find(node => node.type === 'style')), /rgba\(16, 32, 48, 0\.61\).*5\.2px/);
    edit(h, '液态玻璃背景颜色', '#</style><script>');
    const safe = previewProps(h);
    assert.equal(safe.styleValue.backgroundColor, defaults.backgroundColor);
    assert.equal(safe.styleValue.blurSigma, 5.2);
    p.updateProps(safe);
    const css = textContent(p.find(node => node.type === 'style'));
    assert.match(css, /rgba\(32, 32, 32, 0\.61\)/);
    assert.doesNotMatch(css, /<script>|<\/style>/);
    assert.ok(p.all(node => node.props.role === 'status').some(node => textContent(node).includes('无效草稿')));
    assert.equal(h.calls.length, 1);
});
