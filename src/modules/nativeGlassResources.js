const nativeUsers = new WeakMap();
const protectedWindows = new WeakMap();

/** 引用计数原生捕获线程，避免关闭一个区域时销毁其他区域的面板。 */
function retainNativeGlass(native) {
    nativeUsers.set(native, (nativeUsers.get(native) || 0) + 1);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const remaining = nativeUsers.get(native) - 1;
        if (remaining > 0) nativeUsers.set(native, remaining);
        else {
            nativeUsers.delete(native);
            native.shutdown();
        }
    };
}

/** 首个玻璃区域排除内容捕获，最后一个区域释放时恢复窗口原有保护状态。 */
function protectGlassWindow(window, native) {
    let entry = protectedWindows.get(window);
    if (!entry) {
        const wasProtected = window.isContentProtected?.() === true;
        entry = { users: 0, wasProtected };
        if (native.setWindowCapturePolicy?.(window, 'all') !== true) window.setContentProtection(true);
        protectedWindows.set(window, entry);
    }
    entry.users += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        entry.users -= 1;
        if (entry.users !== 0) return;
        protectedWindows.delete(window);
        if (window.isDestroyed()) return;
        if (native.setWindowCapturePolicy?.(window, entry.wasProtected ? 'all' : 'none') !== true) {
            window.setContentProtection(entry.wasProtected);
        }
    };
}

module.exports = { retainNativeGlass, protectGlassWindow };
