(function exposeMiniCountdownGlass(scope) {
  /** 将已校验的颜色写入独立样式表，避免内联样式或影响普通黑底。 */
  function applyGlassStyle(document, style) {
    if (!document || !/^#[0-9a-f]{6}$/i.test(style?.backgroundColor) ||
      typeof style.opacity !== 'number' || !Number.isFinite(style.opacity) ||
      style.opacity < 0 || style.opacity > 1) return;
    const color = style.backgroundColor.slice(1);
    const channels = [0, 2, 4].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16));
    const rule = `.miniCountdown.liquidGlass { --color-mini-glass-tint: rgba(${channels.join(', ')}, ${style.opacity}); }`;
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
    function reportGlassRect(rect) {
      if (!active || sameRect(lastGlassRect, rect)) return;
      lastGlassRect = rect;
      api.send('mini-countdown-glass-rect', rect);
    }

    /** 尺寸或位置实际变化后才更新交互区，拖动结束时恢复完整同步。 */
    function reportInteractiveRect() {
      const rect = readRect();
      if (dragging && rect) {
        reportGlassRect(rect);
        return;
      }
      if (sameRect(lastRect, rect)) return;
      lastRect = rect;
      lastGlassRect = rect;
      api.send('updateInteractiveRect', rect);
    }

    /** 复用拖动帧已有的坐标与尺寸，避免为玻璃额外测量布局。 */
    function reportDragPosition({ x, y, width, height }) {
      if (!active || !dragging || element.style.display !== 'block' || element.classList.contains('fade-hidden')) return;
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
      if (active) reportGlassRect(readRect());
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
      observer.disconnect();
      unsubscribe();
    }

    return { reportInteractiveRect, reportDragPosition, setDragging, destroy };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { createMiniCountdownGlass };
  } else {
    scope.createMiniCountdownGlass = createMiniCountdownGlass;
  }
}(typeof window === 'object' ? window : globalThis));
