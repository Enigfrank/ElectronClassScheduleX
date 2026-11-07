(function exposeToolbarGlass(scope) {
  /** 比较区域快照，避免相同布局反复发送 IPC。 */
  function sameRect(first, second) {
    if (first === second) return true;
    if (!first || !second) return false;
    return ['x', 'y', 'width', 'height', 'cornerRadius'].every(key => first[key] === second[key]);
  }

  /** 主课表及下节提示沿用迷你倒计时的原生首帧握手与共享颜色。 */
  function createToolbarGlass({ api, container, elements,
    getStyle = target => scope.getComputedStyle(target),
    applyStyle = scope.applyCountdownGlassStyle,
    observeResize = callback => new scope.ResizeObserver(callback),
    observeMutations = callback => new scope.MutationObserver(callback),
    requestFrame = callback => scope.requestAnimationFrame(callback),
    cancelFrame = id => scope.cancelAnimationFrame(id) }) {
    const previousRects = new Map();
    const active = new Set();
    const transitionSurfaces = new Map();
    const previousPresentations = new Map();
    let frame = null;
    let destroyed = false;

    /** 自动隐藏、淡出或指针避让时立即移除原生背景，保留原版可见性逻辑。 */
    function readRect(element) {
      for (let current = element; current; current = current.parentElement) {
        const style = getStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden' ||
          current.style.opacity === '0' || current.classList.contains('fade-hidden') ||
          current.classList.contains('fadeOut')) return null;
      }
      const rect = element.getBoundingClientRect();
      if (rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0) return null;
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        cornerRadius: Math.max(0, Number.parseFloat(getStyle(element).borderTopLeftRadius) || 0) };
    }

    /** 按可见背景分别上报矩形，绝不更新鼠标穿透或触摸覆盖窗口。 */
    function reportRects() {
      if (destroyed) return;
      for (const [id, element] of Object.entries(elements)) {
        const surface = transitionSurfaces.get(id);
        const avoided = container.ownerDocument.documentElement.style.opacity === '0';
        const rect = surface ? (avoided ? null : surface.rect) : readRect(element);
        const presentation = rect ? surface?.presentation : undefined;
        const previous = previousPresentations.get(id);
        if (sameRect(previousRects.get(id), rect) && previous?.visible === presentation?.visible &&
          previous?.durationMs === presentation?.durationMs) continue;
        previousRects.set(id, rect);
        previousPresentations.set(id, presentation);
        api.send('toolbar-glass-rect', { id, rect, ...(presentation ? { presentation } : {}) });
      }
    }

    /** 动画显式覆盖背景几何；批量覆盖完成后可统一 report，避免提前显示其他区域。 */
    function setTransitionSurface(id, surface, report = true) {
      if (destroyed || !Object.hasOwn(elements, id)) return;
      if (surface) transitionSurfaces.set(id, surface);
      else transitionSurfaces.delete(id);
      if (report) reportRects();
    }

    /** 将同一帧的内容、尺寸和显示变化合并成一次测量。 */
    function scheduleReport() {
      if (destroyed || frame !== null) return;
      frame = requestFrame(() => {
        frame = null;
        reportRects();
      });
    }

    /** 忽略玻璃外观和首帧标记，尺寸变化仍由 ResizeObserver 上报。 */
    function handleMutations(records) {
      const hasLayoutChange = records.some(record => {
        if (record.type === 'attributes' && record.attributeName === 'class') {
          const stripGlass = value => (value || '').split(/\s+/)
            .filter(name => name && name !== 'liquidGlass' && name !== 'liquidGlassEnabled').join(' ');
          return stripGlass(record.oldValue) !== stripGlass(record.target.className);
        }
        return true;
      });
      if (hasLayoutChange) scheduleReport();
    }

    /** 隐藏和首帧等待保留玻璃外观，就绪标记继续独立控制原生过渡。 */
    function handleState(_event, state) {
      if (!state || !Object.hasOwn(elements, state.id)) return;
      const element = elements[state.id];
      if (state.style) applyStyle(element.ownerDocument, state.style);
      element.classList.toggle('liquidGlassEnabled', state.enabled === true);
      if (state.active === true) active.add(state.id);
      else active.delete(state.id);
      element.classList.toggle('liquidGlass', state.active === true);
      container.classList.toggle('liquidGlass', [...active].some(id => id !== 'nextClassHint'));
    }

    const unsubscribe = api.on('toolbar-glass-state', handleState);
    const resizeObserver = observeResize(scheduleReport);
    resizeObserver.observe(container);
    for (const element of Object.values(elements)) resizeObserver.observe(element);
    const mutations = observeMutations(handleMutations);
    const document = container.ownerDocument;
    mutations.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'],
      attributeOldValue: true, childList: true, subtree: true });
    mutations.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'], attributeOldValue: true });
    scope.addEventListener?.('resize', scheduleReport);
    scheduleReport();

    /** 页面卸载时使排队帧失效并清除全部观察器和订阅。 */
    function destroy() {
      destroyed = true;
      if (frame !== null) cancelFrame(frame);
      resizeObserver.disconnect();
      mutations.disconnect();
      unsubscribe();
      scope.removeEventListener?.('resize', scheduleReport);
    }

    return { reportRects, setTransitionSurface, destroy };
  }

  if (typeof module === 'object' && module.exports) module.exports = { createToolbarGlass };
  else scope.createToolbarGlass = createToolbarGlass;
}(typeof window === 'object' ? window : globalThis));
