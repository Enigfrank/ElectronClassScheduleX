const { normalizeMiniCountdownGlassStyle, validateMiniCountdownGlassStyle } = require('../shared/miniCountdownGlassStyle');

const STARTUP_TIMEOUT_MS = 5000;
const FIRST_FRAME_BAND_ID = 0;

/** 仅在用户请求启用时加载原生桥接。 */
function loadNativeGlass() {
    return require('@hicccc77/electron-liquid-glass');
}

/** 提供可选事件处理器的空实现。 */
function noop() {}

/** 比较物理矩形，避免原生端重复调整大小或重绘。 */
function sameBounds(left, right) {
    return ['x', 'y', 'width', 'height'].every(key => left[key] === right[key]);
}

/** 管理迷你倒计时的原生玻璃、首帧握手和窗口生命周期。 */
class MiniCountdownGlassController {
    /** 注入屏幕、原生桥接和时钟，允许测试完全隔离 Electron。 */
    constructor({ screen, style, loadNative = loadNativeGlass, onState = noop, onError = noop,
        setTimeout: setTimer = setTimeout, clearTimeout: clearTimer = clearTimeout,
        startupTimeoutMs = STARTUP_TIMEOUT_MS }) {
        this.screen = screen;
        this.style = normalizeMiniCountdownGlassStyle(style);
        this.loadNative = loadNative;
        this.onState = onState;
        this.onError = onError;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        this.startupTimeoutMs = startupTimeoutMs;
        this.native = null;
        this.nativeRunning = false;
        this.enabled = false;
        this.active = false;
        this.disposed = false;
        this.window = null;
        this.rect = null;
        this.panel = null;
        this.geometry = null;
        this.restoreCapture = null;
        this.startupTimer = null;
        this.generation = 0;
        this.rendererReady = false;
        this.listeners = [];
    }

    /** 绑定主窗口，替换时清除旧监听和旧 renderer 的矩形。 */
    setWindow(window) {
        if (this.disposed || this.window === window) return;
        const error = this.destroyPanel();
        for (const [target, event, listener] of this.listeners) target.removeListener(event, listener);
        this.listeners = [];
        this.window = window;
        this.rect = null;
        this.rendererReady = Boolean(window && !window.webContents.isLoading());
        if (error) this.fail(error);
        if (!window) return;

        /** 在窗口显示、移动或恢复后同步缓存矩形。 */
        const sync = () => this.sync();
        /** 隐藏时彻底停止捕获，保留矩形供再次显示使用。 */
        const hide = () => {
            const failure = this.destroyPanel();
            if (failure) this.fail(failure);
        };
        /** 页面重载或 renderer 退出后使旧矩形和首帧回调失效。 */
        const resetRenderer = () => {
            this.rendererReady = false;
            this.rect = null;
            hide();
        };
        /** 新页面完成加载后发送初始状态并处理新页面上报的矩形。 */
        const loaded = () => {
            this.rendererReady = true;
            this.notifyState();
            this.sync();
        };
        /** 关闭窗口时解绑其全部监听。 */
        const closed = () => this.setWindow(null);

        for (const event of ['show', 'restore', 'move', 'resize']) this.listen(window, event, sync);
        for (const event of ['hide', 'minimize']) this.listen(window, event, hide);
        this.listen(window, 'closed', closed);
        this.listen(window.webContents, 'did-start-loading', resetRenderer);
        this.listen(window.webContents, 'render-process-gone', resetRenderer);
        this.listen(window.webContents, 'destroyed', resetRenderer);
        this.listen(window.webContents, 'did-finish-load', loaded);
        this.notifyState();
    }

    /** 登记窗口监听，确保窗口重建时可精确移除。 */
    listen(target, event, listener) {
        target.on(event, listener);
        this.listeners.push([target, event, listener]);
    }

    /** 接受布尔偏好，返回实际接受的启用值；关闭路径不加载原生模块。 */
    setEnabled(enabled) {
        if (this.disposed) return false;
        if (enabled !== true) {
            this.enabled = false;
            const error = this.destroyPanel();
            if (error) this.onError(error);
            return false;
        }
        if (this.enabled) return true;
        this.enabled = true;
        try {
            if (!this.native) this.native = this.loadNative();
            if (!this.native?.isSupported()) throw new Error('当前设备不支持原生液态玻璃');
            this.sync();
        } catch (error) {
            this.fail(error);
        }
        return this.enabled;
    }

    /** 应用完整样式；仅模糊变化调用原生 setter，关闭时不加载桥接或创建面板。 */
    setStyle(value) {
        if (this.disposed) return false;
        const result = validateMiniCountdownGlassStyle(value);
        if (!result.success) return false;
        const style = result.style;
        if (Object.keys(style).every(key => style[key] === this.style[key])) {
            this.notifyState();
            return true;
        }
        try {
            if (this.panel && style.blurSigma !== this.style.blurSigma) {
                const params = { ...this.geometry.params, blurSigma: style.blurSigma * this.geometry.dpr };
                this.panel.setParams(params);
                this.geometry = { ...this.geometry, params };
            }
        } catch (error) {
            this.fail(error);
            return false;
        }
        this.style = style;
        this.notifyState();
        return true;
    }

    /** 推送独立样式快照，允许 active 不变时同步色值和透明度。 */
    notifyState() {
        this.onState({ active: this.active, style: { ...this.style } });
    }

    /** 缓存 renderer 提供的内容区域 DIP 矩形；空值立即停止捕获。 */
    updateRect(rect) {
        this.rect = rect && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
            rect.x >= 0 && rect.y >= 0 && rect.width > 0 && rect.height > 0 &&
            (rect.cornerRadius === undefined || Number.isFinite(rect.cornerRadius))
            ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
                cornerRadius: Math.max(0, rect.cornerRadius ?? 0) }
            : null;
        this.sync();
    }

    /** 将内容区域的两个 DIP 屏幕角点转换成真实物理像素。 */
    getGeometry() {
        const content = this.window.getContentBounds();
        const rect = this.rect;
        if (rect.x + rect.width > content.width || rect.y + rect.height > content.height) return null;
        const dipBounds = { x: content.x + rect.x, y: content.y + rect.y,
            width: rect.width, height: rect.height };
        const dpr = this.screen.getDisplayMatching(dipBounds).scaleFactor;
        const topLeft = this.screen.dipToScreenPoint({ x: Math.round(dipBounds.x), y: Math.round(dipBounds.y) });
        const bottomRight = this.screen.dipToScreenPoint({
            x: Math.round(dipBounds.x + dipBounds.width), y: Math.round(dipBounds.y + dipBounds.height)
        });
        const bounds = { x: topLeft.x, y: topLeft.y,
            width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
        if (bounds.width <= 0 || bounds.height <= 0) return null;
        return { bounds, dpr, params: {
            cornerRadius: Math.min(rect.cornerRadius * dpr, bounds.width / 2, bounds.height / 2),
            blurSigma: this.style.blurSigma * dpr, displacementScale: 24 * dpr, aberrationIntensity: 0, saturation: 1.15
        } };
    }

    /** 按事件更新原生面板；没有定时轮询，相同几何不进入原生 setter。 */
    sync() {
        if (this.disposed) return;
        try {
            if (!this.enabled || !this.rect || !this.rendererReady || !this.window ||
                this.window.isDestroyed() || !this.window.isVisible() || this.window.isMinimized()) {
                const error = this.destroyPanel();
                if (error) this.fail(error);
                return;
            }
            const geometry = this.getGeometry();
            if (!geometry) {
                const error = this.destroyPanel();
                if (error) this.fail(error);
                return;
            }
            if (this.panel && this.geometry.dpr !== geometry.dpr) {
                const error = this.destroyPanel();
                if (error) throw error;
            }
            if (!this.panel) {
                this.createPanel(geometry);
                return;
            }
            if (!sameBounds(this.geometry.bounds, geometry.bounds)) this.panel.setBounds(geometry.bounds);
            if (Object.keys(geometry.params).some(key => this.geometry.params[key] !== geometry.params[key])) {
                this.panel.setParams(geometry.params);
            }
            this.geometry = geometry;
        } catch (error) {
            this.fail(error);
        }
    }

    /** 捕获前排除主窗口，销毁时恢复先前保护状态。 */
    protectWindow() {
        const window = this.window;
        const protectedBefore = window.isContentProtected?.() === true;
        /** 恢复 Electron 窗口原先的捕获策略。 */
        this.restoreCapture = () => {
            if (window.isDestroyed()) return;
            if (this.native.setWindowCapturePolicy?.(window, protectedBefore ? 'all' : 'none') !== true) {
                window.setContentProtection(protectedBefore);
            }
        };
        if (this.native.setWindowCapturePolicy?.(window, 'all') !== true) window.setContentProtection(true);
    }

    /** 创建面板并通过一次微小亮度回读等待真实原生首帧。 */
    createPanel(geometry) {
        this.protectWindow();
        const generation = ++this.generation;
        this.geometry = geometry;
        this.startupTimer = this.setTimer(() => {
            if (this.generation === generation) this.fail(new Error('原生液态玻璃首帧超时'));
        }, this.startupTimeoutMs);
        this.startupTimer?.unref?.();
        this.nativeRunning = true;
        this.panel = this.native.createPanel({
            ...geometry.bounds, dpr: geometry.dpr, ...geometry.params,
            anchorWindow: this.window, capturePolicy: 'all',
            // 中心 2x2 采样避开圆角遮罩，并避免原生降采样后区域为空。
            lumaBands: [{ id: FIRST_FRAME_BAND_ID,
                x: Math.max(0, Math.floor((geometry.bounds.width - 2) / 2)),
                y: Math.max(0, Math.floor((geometry.bounds.height - 2) / 2)),
                width: 2, height: 2 }],
            onLuma: bands => this.confirmFirstFrame(generation, bands)
        });
        if (!this.panel) throw new Error('原生液态玻璃面板创建失败');
        this.panel.show(0);
    }

    /** 只有当前代面板的有效首帧可移除黑底，之后关闭亮度回读。 */
    confirmFirstFrame(generation, bands) {
        if (generation !== this.generation || !this.panel || this.active) return;
        const sample = bands?.[FIRST_FRAME_BAND_ID];
        if (!sample || !['r', 'g', 'b', 'darkTail', 'lightTail'].every(key => Number.isFinite(sample[key]))) return;
        try {
            this.panel.setLumaBands([]);
            this.panel.onLuma(null);
            this.clearTimer(this.startupTimer);
            this.startupTimer = null;
            this.setActive(true);
        } catch (error) {
            this.fail(error);
        }
    }

    /** 仅在就绪状态改变时通知 renderer。 */
    setActive(active) {
        if (this.active === active) return;
        this.active = active;
        this.notifyState();
    }

    /** 使回调失效，恢复黑底并释放面板、捕获线程及主窗口保护。 */
    destroyPanel() {
        ++this.generation;
        if (this.startupTimer !== null) this.clearTimer(this.startupTimer);
        this.startupTimer = null;
        this.setActive(false);
        const panel = this.panel;
        const restoreCapture = this.restoreCapture;
        this.panel = null;
        this.geometry = null;
        this.restoreCapture = null;
        let error = null;
        for (const cleanup of [
            () => panel?.onLuma(null),
            () => panel?.hide(0),
            () => panel?.destroy(),
            () => { if (this.nativeRunning) this.native.shutdown(); },
            () => restoreCapture?.()
        ]) {
            try { cleanup(); } catch (failure) { error ??= failure; }
        }
        this.nativeRunning = false;
        return error;
    }

    /** 原生失败时关闭本次启用，并且只报告一次错误。 */
    fail(error) {
        const wasEnabled = this.enabled;
        const wasActive = this.active;
        this.enabled = false;
        this.destroyPanel();
        if (wasEnabled) {
            if (!wasActive) this.notifyState();
            this.onError(error);
        }
    }

    /** 应用退出时解绑窗口并停止已经加载的原生资源。 */
    shutdown() {
        if (this.disposed) return;
        this.setEnabled(false);
        this.setWindow(null);
        this.disposed = true;
    }
}

module.exports = MiniCountdownGlassController;
