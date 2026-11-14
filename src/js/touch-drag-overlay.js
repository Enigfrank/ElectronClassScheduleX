(() => {
  let activePointerId = null;
  let lastPointerEvent = null;
  const overlaySurface = document.body;

  /**
   * 将原生 PointerEvent 转换为可跨 IPC 传递的最小数据。
   * @param {'down'|'move'|'up'|'cancel'} type 事件阶段
   * @param {PointerEvent} event 原生指针事件
   * @returns {{type: 'down'|'move'|'up'|'cancel', pointerId: number, clientX: number, clientY: number}} 可序列化事件
   */
  function serializePointerEvent(type, event) {
    return {
      type,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
  }

  /**
   * 释放当前指针捕获，兼容 pointercancel 已自动释放的情况。
   * @param {number} pointerId 指针标识
   */
  function releasePointerCapture(pointerId) {
    if (overlaySurface.hasPointerCapture(pointerId)) {
      overlaySurface.releasePointerCapture(pointerId);
    }
  }

  overlaySurface.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || activePointerId !== null) return;

    activePointerId = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPointerEvent = serializePointerEvent('down', event);
    window.touchDragOverlayApi.sendPointerEvent(lastPointerEvent);
    event.preventDefault();
  });

  overlaySurface.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointerId) return;
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      endPointerDrag('cancel', event);
      return;
    }

    lastPointerEvent = serializePointerEvent('move', event);
    window.touchDragOverlayApi.sendPointerEvent(lastPointerEvent);
    event.preventDefault();
  });

  /**
   * 结束当前拖动并通知主课表 renderer。
   * @param {'up'|'cancel'} type 结束事件阶段
   * @param {PointerEvent|null} event 原生指针事件，生命周期结束时可省略
   */
  function endPointerDrag(type, event = null) {
    if (activePointerId === null || (event && event.pointerId !== activePointerId)) return;

    const pointerId = activePointerId;
    const payload = type === 'up' ? serializePointerEvent(type, event) : { ...lastPointerEvent, type };
    activePointerId = null;
    lastPointerEvent = null;
    window.touchDragOverlayApi.sendPointerEvent(payload);
    releasePointerCapture(pointerId);
    event?.preventDefault();
  }

  /** 页面隐藏或离开时用最后有效坐标取消拖动。 */
  function cancelPointerDrag() {
    endPointerDrag('cancel');
  }

  /** 非聚焦的原生覆盖窗口使用可见性事件而非 blur 终止拖动。 */
  function handleVisibilityChange() {
    if (document.hidden) cancelPointerDrag();
  }

  overlaySurface.addEventListener('pointerup', event => endPointerDrag('up', event));
  overlaySurface.addEventListener('pointercancel', event => endPointerDrag('cancel', event));
  overlaySurface.addEventListener('lostpointercapture', event => endPointerDrag('cancel', event));
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', cancelPointerDrag);
  window.addEventListener('beforeunload', cancelPointerDrag, { once: true });
})();
