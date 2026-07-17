const { contextBridge, ipcRenderer } = require('electron');

/**
 * 将覆盖窗口中的已规范化指针事件发送到主进程。
 * @param {{type: 'down'|'move'|'up'|'cancel', pointerId: number, clientX: number, clientY: number}} pointerEvent 指针事件数据
 */
function sendPointerEvent(pointerEvent) {
    ipcRenderer.send('touch-drag-overlay-pointer', pointerEvent);
}

contextBridge.exposeInMainWorld('touchDragOverlayApi', { sendPointerEvent });
