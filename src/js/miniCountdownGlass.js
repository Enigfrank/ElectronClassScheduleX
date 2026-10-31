(function exposeMiniCountdownGlass(scope) {
  /** 将已校验的颜色写入独立样式表，避免内联样式或影响普通黑底。 */
  function applyGlassStyle(document, style) {
    if (!document || !/^#[0-9a-f]{6}$/i.test(style?.backgroundColor) ||
      typeof style.opacity !== 'number' || !Number.isFinite(style.opacity) ||
      style.opacity < 0 || style.opacity > 1) return;
    const color = style.backgroundColor.slice(1);
    const channels = [0, 2, 4].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16));
    const rule = `:root { --color-mini-glass-tint: rgba(${channels.join(', ')}, ${style.opacity}); }`;
    let sheet = document.getElementById('mini-countdown-glass-style');
    if (!sheet) {
      sheet = document.createElement('style');
      sheet.id = 'mini-countdown-glass-style';
      document.head.appendChild(sheet);
    }
    if (sheet.textContent !== rule) sheet.textContent = rule;
  }

  /**
   * 同步迷你倒计时的交互矩形与原生玻璃状态，不创建持续运行的计时器。
   * @param {{api: Object, element: HTMLElement, getStyle?: Function, observe?: Function}} options 页面依赖
   * @returns {Object} 页面同步与清理接口
   */
  function createMiniCountdownGlass({
    api,
    element,
    getStyle = target => scope.getComputedStyle(target),
    observe = callback => new scope.ResizeObserver(callback)
  }) {
    let active = false;
    let dragging = false;
    let lastRect;
    let lastGlassRect;
    let glassVisible = true;
    let transitionSurface = null;
    let lastPresentation;
    let destroyed = false;

    /** 根节点的指针避让只抑制原生背景，不改变交互矩形。 */
    function isGlassVisible() {
      return element.ownerDocument?.documentElement?.style.opacity !== '0';
    }

    /** 比较矩形与圆角，避免重复 IPC 和原生窗口更新。 */
    function sameRect(first, second) {
      if (first === second) return true;
      if (!first || !second) return false;
      return ['x', 'y', 'width', 'height', 'cornerRadius'].every(key => first[key] === second[key]);
    }

    /** 读取可见倒计时的实际布局；淡出开始时即释放玻璃背景。 */
    function readRect() {
      if (element.style.display !== 'block' || element.classList.contains('fade-hidden')) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        cornerRadius: Math.max(0, Number.parseFloat(getStyle(element).borderTopLeftRadius) || 0)
      };
    }

    /** 仅移动原生背景，拖动期间保持触摸覆盖窗口的位置不变。 */
    function reportGlassRect(rect, presentation, force = false) {
      if (!isGlassVisible()) rect = null;
      if (!rect) presentation = undefined;
      if (destroyed || (!active && !force) || (sameRect(lastGlassRect, rect) &&
        lastPresentation?.visible === presentation?.visible &&
        lastPresentation?.durationMs === presentation?.durationMs)) return;
      lastGlassRect = rect;
      lastPresentation = presentation;
      if (presentation) api.send('mini-countdown-glass-rect', rect, presentation);
      else api.send('mini-countdown-glass-rect', rect);
    }

    /** 尺寸或位置实际变化后才更新交互区，拖动结束时恢复完整同步。 */
    function reportInteractiveRect() {
      if (destroyed) return;
      if (transitionSurface) {
        reportGlassRect(transitionSurface.rect, transitionSurface.presentation, true);
        return;
      }
      const rect = readRect();
      const visible = isGlassVisible();
      if (glassVisible !== visible) {
        glassVisible = visible;
        lastGlassRect = visible ? rect : null;
        api.send('mini-countdown-glass-rect', lastGlassRect);
      }
      if (dragging && rect) {
        reportGlassRect(rect);
        return;
      }
      if (sameRect(lastRect, rect)) return;
      lastRect = rect;
      lastGlassRect = visible ? rect : null;
      lastPresentation = undefined;
      if (visible) api.send('updateInteractiveRect', rect);
      else api.send('updateInteractiveRect', rect, false);
    }

    /** 复用拖动帧已有的坐标与尺寸，避免为玻璃额外测量布局。 */
    function reportDragPosition({ x, y, width, height }) {
      if (transitionSurface || !active || !dragging || element.style.display !== 'block' || element.classList.contains('fade-hidden')) return;
      reportGlassRect({ x, y, width, height, cornerRadius: lastRect?.cornerRadius ?? 0 });
    }

    /** 首帧就绪后再移除黑底，失败或关闭时恢复原有样式。 */
    function handleState(_event, state) {
      if (state?.style) applyGlassStyle(element.ownerDocument, state.style);
      const nextActive = state?.active === true;
      if (active === nextActive) return;
      active = nextActive;
      lastGlassRect = undefined;
      element.classList.toggle('liquidGlass', active);
      if (transitionSurface) reportInteractiveRect();
      else if (active) reportGlassRect(readRect());
    }

    /** 过渡期间保留原生资源并暂停交互矩形写入，防止旧交互消息重置背景。 */
    function setTransitionSurface(surface) {
      if (destroyed) return;
      transitionSurface = surface;
      if (surface) reportInteractiveRect();
      else {
        reportGlassRect(readRect(), undefined, true);
        reportInteractiveRect();
      }
    }

    /** 记录拖动状态，避免输入覆盖窗口在手指下移动。 */
    function setDragging(value) {
      dragging = value;
    }

    const unsubscribe = api.on('mini-countdown-glass-state', handleState);
    const observer = observe(reportInteractiveRect);
    observer.observe(element);

    /** 页面销毁时移除订阅与尺寸观察，避免重载后残留同步。 */
    function destroy() {
      destroyed = true;
      observer.disconnect();
      unsubscribe();
    }

    return { reportInteractiveRect, reportDragPosition, setDragging, setTransitionSurface, destroy };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { createMiniCountdownGlass, applyGlassStyle };
  } else {
    scope.createMiniCountdownGlass = createMiniCountdownGlass;
    scope.applyCountdownGlassStyle = applyGlassStyle;
  }
}(typeof window === 'object' ? window : globalThis));
