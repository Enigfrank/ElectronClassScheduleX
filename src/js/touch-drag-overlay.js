(() => {
  let activePointerId = null;
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
   * @param {PointerEvent} event 原生指针事件
   */
  function releasePointerCapture(event) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  overlaySurface.addEventListener('pointerdown', event => {
    if (!event.isPrimary || activePointerId !== null) return;

    activePointerId = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    window.touchDragOverlayApi.sendPointerEvent(serializePointerEvent('down', event));
    event.preventDefault();
  });

  overlaySurface.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointerId) return;

    window.touchDragOverlayApi.sendPointerEvent(serializePointerEvent('move', event));
    event.preventDefault();
  });

  /**
   * 结束当前拖动并通知主课表 renderer。
   * @param {'up'|'cancel'} type 结束事件阶段
   * @param {PointerEvent} event 原生指针事件
   */
  function endPointerDrag(type, event) {
    if (event.pointerId !== activePointerId) return;

    window.touchDragOverlayApi.sendPointerEvent(serializePointerEvent(type, event));
    releasePointerCapture(event);
    activePointerId = null;
    event.preventDefault();
  }

  overlaySurface.addEventListener('pointerup', event => endPointerDrag('up', event));
  overlaySurface.addEventListener('pointercancel', event => endPointerDrag('cancel', event));
})();
