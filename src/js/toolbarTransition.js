(function exposeToolbarTransition(scope) {
  const DURATION_MS = 300;
  const EXIT_MS = 70;
  const ARRIVE_MS = 240;

  /** 将阶段时间夹取到透明度和插值使用的范围。 */
  function clamp(value) { return Math.max(0, Math.min(1, value)); }

  /** 仅插值无文字 surface 的几何，不缩放任何课程或倒计时文字。 */
  function interpolateRect(from, to, progress) {
    return Object.fromEntries(['x', 'y', 'width', 'height', 'cornerRadius']
      .map(key => [key, from[key] + (to[key] - from[key]) * progress]));
  }

  /**
   * 在课表和 mini 之间执行可打断的退场、背景变形、文字入场。
   * @param {Object} options 页面元素、玻璃 reporter 与拖动收尾依赖
   * @returns {{setState: Function, isRunning: Function, destroy: Function}} 生命周期接口
   */
  function createToolbarTransition({ container, classContainer, countdownContainer, countdowner,
    countdownSidebar, miniCountdown, toolbarGlass, miniCountdownGlass,
    beforeTransition = () => {}, onSettled = () => {},
    getStyle = target => scope.getComputedStyle(target),
    reducedMotion = () => scope.matchMedia('(prefers-reduced-motion: reduce)').matches,
    requestFrame = callback => scope.requestAnimationFrame(callback),
    cancelFrame = id => scope.cancelAnimationFrame(id), now = () => scope.performance.now() }) {
    const document = container.ownerDocument;
    const root = document.documentElement;
    const surface = document.createElement('div');
    surface.id = 'toolbarTransitionSurface';
    surface.setAttribute('aria-hidden', 'true');
    const sheet = document.createElement('style');
    sheet.id = 'toolbar-transition-geometry';
    document.body.appendChild(surface);
    document.head.appendChild(sheet);
    let state = null;
    let run = null;
    let visual = null;
    let frame = null;
    let destroyed = false;

    /** 读取相对 renderer 的 DIP 矩形，原生和 CSS 使用同一份快照。 */
    function readRect(element) {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height,
        cornerRadius: Math.max(0, Number.parseFloat(getStyle(element).borderTopLeftRadius) || 0) };
    }

    /** 保留既有居中及拖动 transform，只管理当前形态的可见性。 */
    function applyStable(next) {
      container.classList.toggle('toolbar-main-hidden', next.mode !== 'full');
      miniCountdown.style.display = next.mode === 'mini' ? 'block' : 'none';
      countdownContainer.style.display = next.mode === 'full' && next.showCountdown ? 'block' : 'none';
      for (const element of [miniCountdown, countdownContainer]) {
        element.classList.remove('fade-hidden', 'fade-element');
      }
    }

    /** 清空临时几何覆盖后由 reporter 恢复稳定态，不留下空闲帧循环。 */
    function releaseSurfaces() {
      for (const id of ['classContainer', 'countdownSidebar', 'countdowner']) {
        toolbarGlass.setTransitionSurface(id, null, false);
      }
      toolbarGlass.reportRects();
      miniCountdownGlass.setTransitionSurface(null);
    }

    /** 取消旧帧并提交目标形态，位置重置回调仅在 mini 已不可见后执行。 */
    function settle() {
      if (frame !== null) cancelFrame(frame);
      frame = null;
      run = null;
      visual = null;
      applyStable(state);
      root.classList.remove('toolbar-transition-running');
      sheet.textContent = '';
      onSettled(state);
      releaseSurfaces();
    }

    /** 按外观偏好选择材质，目标等待首帧时不混入原版黑底。 */
    function appearance(element) {
      const glass = element.classList.contains('liquidGlassEnabled') || element.classList.contains('liquidGlass');
      const mini = element === miniCountdown;
      return {
        color: glass ? 'var(--color-mini-glass-tint)' : 'var(--toolbar-original-background)',
        border: glass ? 'var(--color-mini-glass-edge)' : mini ? 'var(--toolbar-mini-border)' : 'transparent',
        width: glass || mini ? Number.parseFloat(getStyle(miniCountdown).borderTopWidth) || 0 : 0,
        blur: glass ? 0 : Number.parseFloat(getStyle(root).getPropertyValue('--countdown-original-blur')) || 0
      };
    }

    /** 显式驱动原生几何与展示；旁路 reporter 不依赖 WAAPI 的观察器回调。 */
    function reportSurfaces(rect, elapsed) {
      const arrived = elapsed >= ARRIVE_MS;
      const destination = state.mode === 'mini' ? 'miniCountdown' : 'classContainer';
      for (const id of ['miniCountdown', 'classContainer']) {
        const visible = run.detour ? arrived && id === destination
          : arrived ? id === destination : id === run.owner;
        const durationMs = arrived ? DURATION_MS - ARRIVE_MS : run.detour ? EXIT_MS : 0;
        const element = id === 'miniCountdown' ? miniCountdown : classContainer;
        const override = { rect: visible || element.classList.contains('liquidGlass') ? rect : null,
          presentation: { visible, durationMs } };
        if (id === 'miniCountdown') miniCountdownGlass.setTransitionSurface(override);
        else toolbarGlass.setTransitionSurface(id, override, false);
      }
      for (const [id, element] of [['countdownSidebar', countdownSidebar], ['countdowner', countdowner]]) {
        const visible = arrived && state.mode === 'full' && (id !== 'countdowner' || state.showCountdown);
        toolbarGlass.setTransitionSurface(id, {
          rect: (!visible && !element.classList.contains('liquidGlass')) || element.style.display === 'none' ||
            (id === 'countdowner' && countdownContainer.style.display === 'none') ? null : readRect(element),
          presentation: { visible, durationMs: arrived ? DURATION_MS - ARRIVE_MS : EXIT_MS }
        }, false);
      }
      toolbarGlass.reportRects();
    }

    /** 将一次快照写入独立样式元素，运行时不写 inline 颜色、间距或字排。 */
    function render(timestamp) {
      const elapsed = Math.max(0, timestamp - run.started);
      const exit = clamp(elapsed / EXIT_MS);
      const morph = clamp((elapsed - EXIT_MS) / (ARRIVE_MS - EXIT_MS));
      const eased = 1 - Math.pow(1 - morph, 3);
      const enter = clamp((elapsed - ARRIVE_MS) / (DURATION_MS - ARRIVE_MS));
      // 首帧握手可能给目标增加玻璃边框，终点使用最新布局而不重新启动时间轴。
      run.to = readRect(state.mode === 'mini' ? miniCountdown : classContainer);
      let from = run.from;
      let opacity = run.opacity + (1 - run.opacity) * morph;
      if (run.detour) {
        if (elapsed < EXIT_MS) opacity *= 1 - exit;
        else {
          from = run.arrival;
          opacity = morph;
        }
      }
      const rect = interpolateRect(from, run.to, eased);
      const mainOpacity = state.mode === 'full' ? enter : 0;
      const miniOpacity = state.mode === 'mini' ? enter : 0;
      visual = { rect, opacity,
        mainOpacity: run.mainOpacity * (1 - exit) + mainOpacity,
        miniOpacity: run.miniOpacity * (1 - exit) + miniOpacity };
      const start = run.startAppearance;
      const end = appearance(state.mode === 'mini' ? miniCountdown : classContainer);
      const mix = eased * 100;
      const color = `color-mix(in srgb, ${start.color} ${100 - mix}%, ${end.color})`;
      const border = `color-mix(in srgb, ${start.border} ${100 - mix}%, ${end.border})`;
      visual.appearance = { color, border, width: start.width + (end.width - start.width) * eased,
        blur: start.blur + (end.blur - start.blur) * eased };
      sheet.textContent = `:root { --toolbar-main-opacity: ${visual.mainOpacity}; --toolbar-mini-opacity: ${visual.miniOpacity}; }
        #toolbarTransitionSurface { --toolbar-surface-x: ${rect.x}px; --toolbar-surface-y: ${rect.y}px;
          --toolbar-surface-width: ${rect.width}px; --toolbar-surface-height: ${rect.height}px;
          --toolbar-surface-radius: ${rect.cornerRadius}px; --toolbar-surface-opacity: ${opacity};
          --toolbar-surface-color: ${color}; --toolbar-surface-border-color: ${border};
          --toolbar-surface-border-width: ${visual.appearance.width}px;
          --toolbar-surface-blur: ${visual.appearance.blur}px; }`;
      reportSurfaces(rect, elapsed);
      if (elapsed >= DURATION_MS) settle();
      else frame = requestFrame(render);
    }

    /** 每秒 tick 只更新内容；仅形态发生变化时启动或反转动画。 */
    function setState(next) {
      if (destroyed) return;
      if (state?.mode === next.mode) {
        if (state.showCountdown === next.showCountdown) return;
        state = next;
        if (!run) applyStable(next);
        else {
          countdownContainer.style.display = next.showCountdown ? 'block' : 'none';
          reportSurfaces(visual.rect, Math.max(0, now() - run.started));
        }
        return;
      }
      beforeTransition();
      const previous = state;
      state = next;
      if (!previous || next.mode === 'hidden' || previous.mode === 'hidden' || reducedMotion() || root.style.opacity === '0') {
        settle();
        return;
      }
      if (frame !== null) cancelFrame(frame);
      frame = null;
      const source = previous.mode === 'mini' ? miniCountdown : classContainer;
      const from = visual?.rect || readRect(source);
      const owner = run?.owner || (previous.mode === 'mini' ? 'miniCountdown' : 'classContainer');
      const startAppearance = visual?.appearance || appearance(source);
      container.classList.remove('toolbar-main-hidden');
      miniCountdown.style.display = 'block';
      const showCountdown = next.mode === 'full' ? next.showCountdown : previous.showCountdown;
      countdownContainer.style.display = showCountdown ? 'block' : 'none';
      const target = next.mode === 'mini' ? miniCountdown : classContainer;
      const to = readRect(target);
      const detour = next.mode === 'full' && next.moved;
      run = { started: now(), owner, from, to, detour, startAppearance,
        opacity: visual?.opacity ?? 1,
        mainOpacity: visual?.mainOpacity ?? (previous.mode === 'full' ? 1 : 0),
        miniOpacity: visual?.miniOpacity ?? (previous.mode === 'mini' ? 1 : 0),
        arrival: { ...from, x: to.x + (to.width - from.width) / 2, y: to.y } };
      root.classList.add('toolbar-transition-running');
      render(run.started);
    }

    /** 卸载后取消唯一动画帧，移除临时 DOM、样式与所有原生覆盖。 */
    function destroy() {
      if (destroyed) return;
      if (frame !== null) cancelFrame(frame);
      frame = null;
      if (state) {
        applyStable(state);
        releaseSurfaces();
      }
      run = null;
      destroyed = true;
      root.classList.remove('toolbar-transition-running');
      sheet.remove();
      surface.remove();
    }

    return { setState, isRunning: () => run !== null, destroy };
  }

  if (typeof module === 'object' && module.exports) module.exports = { createToolbarTransition };
  else scope.createToolbarTransition = createToolbarTransition;
}(typeof window === 'object' ? window : globalThis));
