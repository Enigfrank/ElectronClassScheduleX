const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

/**
 * 在内存中执行真实编辑器、字段与共享滑块 JSX，替换 Chakra 外观并记录 IPC。
 * @param {Object} cssStyle 导入的样式配置
 * @returns {Promise<Object>} 可操作真实回调的编辑器测试装置
 */
async function createEditorHarness(cssStyle = {}) {
  const featurePath = '../ECSX-Gui/src/features/schedule-editor/';
  const parser = await import(`${featurePath}configParser.mjs`);
  const editorHelpers = await import(`${featurePath}scheduleEditorHelpers.mjs`);
  const sliderHelpers = await import(`${featurePath}styleSliderHelpers.mjs`);
  const guiRequire = createRequire(path.resolve(__dirname, '../ECSX-Gui/package.json'));
  const { transformSync } = guiRequire('@babel/core');
  const components = new Map();
  const effects = [];
  const requests = [];
  let current;
  let tree;
  const react = {
    __esModule: true,
    default: {
      /** 保存 JSX 节点，交给渲染装置展开真实组件。 */
      createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    },
    /** 按组件挂载位置记录状态，支持 React 函数式更新。 */
    useState(initial) {
      const owner = current;
      const index = owner.cursor++;
      if (!(index in owner.state)) owner.state[index] = typeof initial === 'function' ? initial() : initial;
      return [owner.state[index], (next) => {
        owner.state[index] = typeof next === 'function' ? next(owner.state[index]) : next;
      }];
    },
    /** 为每个 Hook 位置保留稳定引用。 */
    useRef(initial) {
      const index = current.cursor++;
      if (!(index in current.state)) current.state[index] = { current: initial };
      return current.state[index];
    },
    /** 仅在依赖变化时安排提交后的 Effect。 */
    useEffect(effect, dependencies) {
      const index = current.cursor++;
      const previous = current.state[index];
      if (!previous || dependencies.some((value, position) => !Object.is(value, previous[position]))) {
        effects.push(effect);
        current.state[index] = dependencies;
      }
    },
    /** 按 React 依赖语义缓存派生值，保持 IPC 初始化回调身份稳定。 */
    useMemo(factory, dependencies) {
      const index = current.cursor++;
      const previous = current.state[index];
      if (!previous || dependencies.some((value, position) => !Object.is(value, previous.dependencies[position]))) {
        current.state[index] = { dependencies, value: factory() };
      }
      return current.state[index].value;
    },
    /** 复用依赖未改变的回调，避免错误触发初始化 Effect。 */
    useCallback(callback, dependencies) { return react.useMemo(() => callback, dependencies); },
  };
  const chakra = new Proxy({ useColorModeValue: (light) => light }, {
    get: (target, name) => target[name] ?? String(name),
  });
  const modules = {
    react,
    '@chakra-ui/react': chakra,
    'lucide-react': new Proxy({}, { get: (_target, name) => String(name) }),
    './configParser.mjs': parser,
    './scheduleEditorHelpers.mjs': editorHelpers,
    './styleSliderHelpers.mjs': sliderHelpers,
    './ScheduleEditorControls.jsx': new Proxy({}, { get: (_target, name) => String(name) }),
  };

  /** 转译 JSX 模块，所有导入均来自真实纯函数或显式依赖替身。 */
  function loadComponent(relativePath) {
    const filename = path.resolve(__dirname, relativePath);
    const compiled = transformSync(readFileSync(filename, 'utf8'), {
      filename,
      configFile: false,
      babelrc: false,
      presets: [guiRequire.resolve('@babel/preset-react')],
      plugins: [guiRequire.resolve('@babel/plugin-transform-modules-commonjs')],
    }).code;
    const module = { exports: {} };
    vm.runInNewContext(compiled, {
      module,
      exports: module.exports,
      require(name) {
        assert.ok(Object.hasOwn(modules, name), `未提供 JSX 依赖：${name}`);
        return modules[name];
      },
    }, { filename });
    return module.exports;
  }

  modules['../../components/CommitSlider.jsx'] = loadComponent('../ECSX-Gui/src/components/CommitSlider.jsx');
  modules['./StyleFieldControl.jsx'] = loadComponent(`${featurePath}StyleFieldControl.jsx`);
  const Editor = loadComponent(`${featurePath}ScheduleEditorView.jsx`).default;
  const ipcRenderer = {
    /** 返回可导入的课表源码，并记录保存和应用的通道顺序。 */
    async invoke(channel, ...args) {
      requests.push([channel, ...args]);
      if (channel === 'read-schedule-config-source') {
        return { success: true, source: parser.generateScheduleConfigSource(parser.normalizeScheduleConfigForEditor({ css_style: cssStyle })) };
      }
      return { success: true };
    },
  };

  /** 递归执行真实函数组件，并为每个挂载位置保留独立 Hook 状态。 */
  function expand(node, location = 'root') {
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${location}/${index}`));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const identity = `${location}:${node.type.name}:${node.props.key ?? ''}`;
      if (!components.has(identity)) components.set(identity, { state: [], cursor: 0 });
      current = components.get(identity);
      current.cursor = 0;
      return expand(node.type(node.props), `${identity}/output`);
    }
    return { ...node, props: { ...node.props, children: expand(node.props.children, `${location}/children`) } };
  }

  /** 重新渲染并执行依赖变化的 Effect。 */
  function render() {
    tree = expand({ type: Editor, props: { ipcRenderer } });
    effects.splice(0).forEach((effect) => effect());
  }

  /** 查找已经展开为 Chakra 控件的 JSX 节点。 */
  function findAll(type, predicate = () => true, node = tree) {
    if (Array.isArray(node)) return node.flatMap((child) => findAll(type, predicate, child));
    if (!node || typeof node !== 'object') return [];
    const matches = node.type === type && predicate(node.props) ? [node.props] : [];
    return [...matches, ...findAll(type, predicate, node.props.children)];
  }

  render();
  await new Promise((resolve) => setImmediate(resolve));
  render();
  render();
  return {
    render,
    requests,
    findAll,
    input: (key) => findAll('Input', (props) => props['aria-label'] === `${key} 的值`)[0],
    slider: (key, axis = '') => findAll('Slider', (props) => props['aria-label'] === `${key} 的${axis}滑块`)[0],
  };
}

test('真实样式 JSX 拖动仅更新本地值，松手后更新文本和源码，不触发保存或应用', async () => {
  const h = await createEditorHarness();
  const sourceBefore = h.findAll('Textarea')[0].value;
  h.slider('--center-font-size').onChange(48);
  h.render();
  assert.equal(h.slider('--center-font-size').value, 48);
  assert.equal(h.input('--center-font-size').value, '35px');
  assert.equal(h.findAll('Textarea')[0].value, sourceBefore);
  h.slider('--center-font-size').onChangeEnd(48);
  h.render();
  assert.equal(h.input('--center-font-size').value, '48px');
  assert.match(h.findAll('Textarea')[0].value, /'--center-font-size': '48px'/);
  assert.deepEqual(h.requests.map(([channel]) => channel), ['read-schedule-config-source']);
  await h.findAll('Button', (props) => props.children.includes('保存配置并应用'))[0].onClick();
  assert.deepEqual(h.requests.map(([channel]) => channel), [
    'read-schedule-config-source', 'save-schedule-config-source', 'apply-schedule-config',
  ]);
  assert.match(h.requests[1][1], /'--center-font-size': '48px'/);
});

test('padding 两轴通过真实 JSX 独立提交，单值可展开且保留精确文本输入', async () => {
  const h = await createEditorHarness({ '--container-bg-padding': '8px' });
  h.slider('--container-bg-padding', '横向').onChangeEnd(24);
  h.render();
  assert.equal(h.input('--container-bg-padding').value, '8px 24px');
  h.slider('--container-bg-padding', '纵向').onChangeEnd(12);
  h.render();
  assert.equal(h.input('--container-bg-padding').value, '12px 24px');
  h.input('--container-bg-padding').onChange({ target: { value: '8px 14p' } });
  h.render();
  assert.equal(h.input('--container-bg-padding').value, '8px 14p');
  assert.equal(h.slider('--container-bg-padding', '纵向'), undefined);
  assert.equal(h.slider('--container-bg-padding', '横向'), undefined);
});

test('既有超范围、透明度、自定义 CSS 保留原值，文本修改同步滑块', async () => {
  const h = await createEditorHarness({
    '--center-font-size': '145px',
    '--global-bg-opacity': '0.72',
    '--custom-gap': '12px',
    '--top-space': 'var(--custom-gap)',
    '--countdown-bg-padding': '1px 2px 3px 4px',
  });
  assert.equal(h.input('--center-font-size').value, '145px');
  assert.equal(h.slider('--center-font-size').max, 145);
  assert.equal(h.slider('--global-bg-opacity').step, 0.01);
  h.slider('--global-bg-opacity').onChangeEnd(0.55);
  h.render();
  assert.equal(h.input('--global-bg-opacity').value, '0.55');
  for (const key of ['--custom-gap', '--top-space', '--countdown-bg-padding']) {
    assert.ok(h.input(key));
    assert.equal(h.slider(key), undefined);
  }
  assert.equal(h.input('--top-space').value, 'var(--custom-gap)');
  assert.equal(h.input('--countdown-bg-padding').value, '1px 2px 3px 4px');
  h.input('--center-font-size').onChange({ target: { value: '22px' } });
  h.render();
  h.render();
  assert.equal(h.slider('--center-font-size').value, 22);
  h.input('--center-font-size').onChange({ target: { value: 'calc(' } });
  h.render();
  assert.equal(h.input('--center-font-size').value, 'calc(');
  assert.equal(h.slider('--center-font-size'), undefined);
  assert.deepEqual(h.requests.map(([channel]) => channel), ['read-schedule-config-source']);
});
