(function exposeToolbarTransition(scope) {
  const DURATION_MS = 300;
  const EXIT_MS = 70;
  const ARRIVE_MS = 240;
  const TOOLBAR_GLASS_IDS = ['classContainer', 'countdownSidebar', 'countdowner'];

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
    document.body.appendChild(surface);
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
      for (const id of TOOLBAR_GLASS_IDS) {
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
      clearVisual();
      onSettled(state);
      releaseSurfaces();
    }

    /** 清除动画专用透明度，回到 DOM 元素自身的材质和可见性。 */
    function clearVisual() {
      root.classList.remove('toolbar-transition-running');
      container.style.removeProperty('--toolbar-content-opacity');
      miniCountdown.style.removeProperty('--toolbar-content-opacity');
    }

    /** 按外观偏好选择材质，目标等待首帧时继续使用玻璃 tint。 */
    function appearance(element) {
      const glass = element.classList.contains('liquidGlassEnabled') || element.classList.contains('liquidGlass');
      const mini = element === miniCountdown;
      return {
        color: glass ? 'var(--color-mini-glass-tint)' : 'var(--toolbar-original-background)',
        border: glass ? 'var(--color-mini-glass-edge)' : mini ? 'var(--toolbar-mini-border)' : 'transparent',
        width: glass || mini ? Number.parseFloat(getStyle(element).borderTopWidth) || 0 : 0
      };
    }

    /** 已呈现的面板在原处淡出，并保留到新面板创建，避免中途重启共享捕获。 */
    function getOutgoingSurfaces(previousMode) {
      const ids = previousMode === 'mini' ? ['miniCountdown'] : TOOLBAR_GLASS_IDS;
      const surfaces = {};
      for (const id of ids) {
        const rect = id === 'miniCountdown' ? miniCountdownGlass.getReportedRect() : toolbarGlass.getReportedRect(id);
        if (rect) surfaces[id] = { rect, presentation: { visible: false, durationMs: EXIT_MS } };
      }
      return surfaces;
    }

    /** 只在阶段边界上报固定矩形，避免动画反复调整原生交换链的尺寸。 */
    function reportSurfaces(arrived) {
      const incoming = { visible: true, durationMs: DURATION_MS - ARRIVE_MS };
      const hidden = { rect: null };
      const full = arrived && state.mode === 'full';
      const mini = arrived && state.mode === 'mini';
      miniCountdownGlass.setTransitionSurface(mini ? { rect: run.to, presentation: incoming }
        : run.outgoing.miniCountdown ?? hidden);
      const incomingRects = full ? {
        classContainer: run.to,
        countdownSidebar: getStyle(countdownSidebar).display !== 'none' ? readRect(countdownSidebar) : null,
        countdowner: state.showCountdown ? readRect(countdowner) : null
      } : {};
      for (const id of TOOLBAR_GLASS_IDS) {
        const rect = incomingRects[id];
        toolbarGlass.setTransitionSurface(id, rect ? { rect, presentation: incoming } : run.outgoing[id] ?? hidden, false);
      }
      toolbarGlass.reportRects();
    }

    /** 更新局部过渡图层，不重建样式表，也不在逐帧写入后同步读取布局。 */
    function render(timestamp) {
      const elapsed = Math.max(0, timestamp - run.started);
      const exit = clamp(elapsed / EXIT_MS);
      const morph = clamp((elapsed - EXIT_MS) / (ARRIVE_MS - EXIT_MS));
      const eased = 1 - Math.pow(1 - morph, 3);
      const enter = clamp((elapsed - ARRIVE_MS) / (DURATION_MS - ARRIVE_MS));
      if (!run.arrived && elapsed >= ARRIVE_MS) {
        const target = state.mode === 'mini' ? miniCountdown : classContainer;
        run.to = readRect(target);
        run.endAppearance = appearance(target);
        run.arrived = true;
        reportSurfaces(true);
      }
      let from = run.from;
      let opacity = run.opacity + (1 - run.opacity) * morph;
      if (run.detour) {
        if (elapsed < EXIT_MS) opacity *= 1 - exit;
        else {
          from = { ...from, x: run.to.x + (run.to.width - from.width) / 2, y: run.to.y };
          opacity = morph;
        }
      }
      const rect = interpolateRect(from, run.to, eased);
      const mainOpacity = state.mode === 'full' ? enter : 0;
      const miniOpacity = state.mode === 'mini' ? enter : 0;
      const start = run.startAppearance;
      const end = run.endAppearance;
      const mix = eased * 100;
      const color = start.color === end.color ? end.color : `color-mix(in srgb, ${start.color} ${100 - mix}%, ${end.color})`;
      const border = start.border === end.border ? end.border : `color-mix(in srgb, ${start.border} ${100 - mix}%, ${end.border})`;
      visual = { rect, opacity,
        mainOpacity: run.mainOpacity * (1 - exit) + mainOpacity,
        miniOpacity: run.miniOpacity * (1 - exit) + miniOpacity,
        appearance: { color, border, width: start.width + (end.width - start.width) * eased } };
      container.style.setProperty('--toolbar-content-opacity', visual.mainOpacity);
      miniCountdown.style.setProperty('--toolbar-content-opacity', visual.miniOpacity);
      Object.assign(surface.style, {
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: `${rect.cornerRadius}px`,
        opacity, backgroundColor: color, borderColor: border, borderWidth: `${visual.appearance.width}px`
      });
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
          if (run.arrived) reportSurfaces(true);
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
      const outgoing = run ? {} : getOutgoingSurfaces(previous.mode);
      const startAppearance = visual?.appearance || appearance(source);
      container.classList.remove('toolbar-main-hidden');
      miniCountdown.style.display = 'block';
      const showCountdown = next.mode === 'full' ? next.showCountdown : previous.showCountdown;
      countdownContainer.style.display = showCountdown ? 'block' : 'none';
      const target = next.mode === 'mini' ? miniCountdown : classContainer;
      const to = readRect(target);
      const detour = next.mode === 'full' && next.moved;
      run = { started: now(), outgoing, from, to, detour, startAppearance, endAppearance: appearance(target),
        opacity: visual?.opacity ?? 1,
        mainOpacity: visual?.mainOpacity ?? (previous.mode === 'full' ? 1 : 0),
        miniOpacity: visual?.miniOpacity ?? (previous.mode === 'mini' ? 1 : 0), arrived: false };
      root.classList.add('toolbar-transition-running');
      reportSurfaces(false);
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
      clearVisual();
      surface.remove();
    }

    return { setState, isRunning: () => run !== null, destroy };
  }

  if (typeof module === 'object' && module.exports) module.exports = { createToolbarTransition };
  else scope.createToolbarTransition = createToolbarTransition;
}(typeof window === 'object' ? window : globalThis));
