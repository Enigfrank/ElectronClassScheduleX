const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { EventEmitter } = require('events');

const MIN_WINDOW_WIDTH = 1;
const MIN_WINDOW_HEIGHT = 1;
const DEFAULT_WINDOW_WIDTH = 260;
const DEFAULT_WINDOW_HEIGHT = 44;
const HINT_GAP = 10;
/**
 * 药丸投影留白，与 mini-countdown.css 的 --glass-shadow-space 保持一致。
 * 窗口按 body（含 padding）收紧，药丸本体比窗口每侧小 GLASS_PADDING，
 * 提示窗口贴靠时必须扣掉这部分，否则两块玻璃之间会多出 2 倍留白的缝隙。
 */
const GLASS_PADDING = 34;
/**
 * 药丸本体顶部距离屏幕顶部的距离。窗口原点要减去 GLASS_PADDING，
 * 否则药丸会被投影留白顶到屏幕外。
 */
const DEFAULT_TOP_SPACE = 5;
/**
 * 提示的"展示区间"高度，以药丸窗口高度为单位。
 *
 * 提示的归属位置是屏幕顶部正中央，药丸停在那里时两者并排显示最自然。
 * 药丸被拖离顶部横带之后，提示就回到顶部正中央这个固定位置，
 * 而不是继续粘在药丸旁边跟着跑出视野。
 * 取 2 倍药丸高（约 156px），让药丸在顶部小幅移动时不会来回跳，
 * 又不会把"已经拖到屏幕中段"的药丸也算成还在顶部横带内。
 */
const HINT_TOP_BAND_RATIO = 2;
/**
 * 拖动轮询间隔，约 60fps。
 *
 * 拖动位置必须由主进程轮询光标得出，不能用 renderer 的 pointermove 增量：
 * 透明窗口一旦 setPosition，Chromium 会丢弃后续 mousemove 投递
 * （实测 40 步位移只收到 2 个事件，clientX 从 122 直接跳到 -178），
 * 指针增量因此退化成单次大跳步，窗口跟不上指针就会拖出残影。
 */
const DRAG_POLL_INTERVAL_MS = 16;
const RENDERER_READY_TIMEOUT_MS = 10000;

/**
 * 由药丸本体顶部位置算出窗口原点。
 * @param {number} workAreaTop 显示器工作区顶部
 * @param {number} topSpace renderer 解析后的顶部间距（像素）
 * @returns {number} 窗口 y 坐标
 */
function windowTopFor(workAreaTop, topSpace) {
    return Math.round(workAreaTop + topSpace - GLASS_PADDING);
}

/**
 * 计算提示窗口左边距，使两块药丸本体之间保持固定间隙。
 * 倒计时药丸右边缘 = anchor.x + anchor.width - GLASS_PADDING，
 * 提示药丸左边缘 = hintX + GLASS_PADDING，两者相减即得 hintX。
 * @param {{x: number, width: number}} anchor 倒计时窗口边界
 * @returns {number} 提示窗口左边界
 */
function hintLeftFor(anchor) {
    return anchor.x + anchor.width - GLASS_PADDING + HINT_GAP - GLASS_PADDING;
}

/**
 * 迷你倒计时与下节课提示的系统玻璃窗口。
 *
 * 两个表面各占一个透明窗口。实测结论（Windows 11 / Electron 42）：
 *   - `backgroundMaterial: 'acrylic'` 由 DWM 铺满整个 BrowserWindow 矩形，
 *     `roundedCorners`、`setShape()` 都无法裁切它，窗口必然是直角灰板，
 *     这正是"胶囊四周有半透明遮罩"和"劣质塑料感"的直接原因。
 *   - `transparent: true` 的窗口只合成页面自身的 alpha，圆角完全由 CSS 决定，
 *     胶囊之外真正透明，且可以用 inset 高光 + 外投影模拟玻璃厚度。
 * 因此这里放弃系统材质，改用透明窗口承载 CSS 玻璃。
 */
class MiniCountdownGlassWindow extends EventEmitter {
    /**
     * @param {ConfigManager} configManager 配置管理器实例
     * @param {Object} logger 日志记录器实例
     */
    constructor(configManager, logger) {
        super();
        this.configManager = configManager;
        this.logger = logger;
        this.countdownWindow = null;
        this.hintWindow = null;
        this.countdownVisible = false;
        this.hintVisible = false;
        this.countdownSize = { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT };
        this.hintSize = { width: 0, height: 0 };
        this.pendingCountdownState = null;
        this.pendingHintName = '';
        this.lastCountdownContent = null;
        this.lastHintName = '';
        this.dragTimer = null;
        this.dragAnchor = null;
        this.lightBackground = null;
        this.topSpace = DEFAULT_TOP_SPACE;
        this.suppressed = false;
        this.unavailable = false;
        this.destroying = false;
        this.readyTimers = new Map();
        this.readyWindows = new Set();
        this.windowsVisible = false;
    }

    /**
     * 停用故障玻璃窗口并通知主课表启用本地倒计时。
     * @param {Error} error 创建、加载或 renderer 就绪错误
     */
    markUnavailable(error) {
        if (this.unavailable || this.destroying) return;
        this.unavailable = true;
        for (const timer of this.readyTimers.values()) clearTimeout(timer);
        this.readyTimers.clear();
        this.setVisible(false);
        this.log('error', `[迷你倒计时] 玻璃窗口不可用，切换本地显示: ${error.message}`);
        this.emit('unavailable');
    }

    /**
     * 监听窗口加载故障，并等待 renderer 上报首个有效尺寸作为就绪握手。
     * @param {BrowserWindow} win 新建的玻璃窗口
     */
    watchWindow(win) {
        const timer = setTimeout(() => {
            this.markUnavailable(new Error('玻璃窗口初始化超时'));
        }, RENDERER_READY_TIMEOUT_MS);
        timer.unref?.();
        this.readyTimers.set(win, timer);
        win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
            if (isMainFrame === false) return;
            this.markUnavailable(new Error(`页面加载失败 (${code}): ${description}`));
        });
        win.webContents.on('render-process-gone', (_event, details) => {
            this.markUnavailable(new Error(`展示进程退出: ${details?.reason || 'unknown'}`));
        });
        win.on('closed', () => {
            clearTimeout(this.readyTimers.get(win));
            this.readyTimers.delete(win);
            this.readyWindows.delete(win);
            this.markUnavailable(new Error('玻璃窗口已关闭'));
        });
    }

    /**
     * 确认窗口已能渲染内容，并清除就绪超时。
     * @param {BrowserWindow} win 完成尺寸上报的窗口
     */
    markWindowReady(win) {
        clearTimeout(this.readyTimers.get(win));
        this.readyTimers.delete(win);
        this.readyWindows.add(win);
        this.setVisible(this.countdownVisible);
    }

    /**
     * 考试期间统一隐藏两个窗口，保留持续更新的内容与可见性状态。
     * @param {boolean} suppressed 是否暂停玻璃窗口展示
     */
    setSuppressed(suppressed) {
        this.suppressed = Boolean(suppressed);
        this.setVisible(this.countdownVisible);
    }

    /**
     * 记录日志。
     * @param {string} level 日志级别
     * @param {string} message 日志内容
     */
    log(level, message) {
        this.logger?.[level]?.(message);
    }

    /**
     * 按统一参数创建一个承载 CSS 玻璃的透明工具窗口。
     *
     * 窗口必须 `transparent: true`，否则整块矩形会被系统画成不透明底板。
     * `thickFrame:false` 用于去掉 frameless 窗口在 Windows 上默认保留的
     * 16x8 不可调整边框，否则 setBounds 传入的内容尺寸会被扣掉这部分，
     * 文字会被裁切压扁。
     *
     * @param {{x: number, y: number, width: number, height: number}} bounds 初始边界
     * @param {string} preloadFile preload 文件名
     * @returns {BrowserWindow|null} 新建的窗口，创建失败时为空
     */
    createToolWindow(bounds, preloadFile) {
        try {
            const win = new BrowserWindow({
                x: Math.round(bounds.x),
                y: Math.round(bounds.y),
                width: Math.max(MIN_WINDOW_WIDTH, Math.round(bounds.width)),
                height: Math.max(MIN_WINDOW_HEIGHT, Math.round(bounds.height)),
                frame: false,
                transparent: true,
                backgroundColor: '#00000000',
                roundedCorners: false,
                thickFrame: false,
                hasShadow: false,
                show: false,
                focusable: false,
                resizable: false,
                // 药丸通过 -webkit-app-region: drag 拖动，这条路径由系统执行
                // WM_NCLBUTTONDOWN 移动循环，必须允许窗口移动。
                movable: true,
                minimizable: false,
                maximizable: false,
                fullscreenable: false,
                skipTaskbar: true,
                alwaysOnTop: this.configManager.getWindowAlwaysOnTop(),
                type: 'toolbar',
                webPreferences: {
                    preload: path.join(__dirname, '..', 'preload', preloadFile),
                    nodeIntegration: false,
                    contextIsolation: true,
                    sandbox: true
                }
            });
            this.watchWindow(win);
            return win;
        } catch (error) {
            this.markUnavailable(error);
            return null;
        }
    }

    /**
     * 创建并加载迷你倒计时玻璃窗口，默认隐藏直到收到倒计时状态。
     * @returns {BrowserWindow|null} 倒计时玻璃窗口实例
     */
    create() {
        if (this.unavailable || this.destroying) return null;
        if (this.countdownWindow && !this.countdownWindow.isDestroyed()) return this.countdownWindow;

        const { workArea } = screen.getPrimaryDisplay();
        this.countdownWindow = this.createToolWindow({
            x: workArea.x + (workArea.width - DEFAULT_WINDOW_WIDTH) / 2,
            y: windowTopFor(workArea.y, this.topSpace),
            width: DEFAULT_WINDOW_WIDTH,
            height: DEFAULT_WINDOW_HEIGHT
        }, 'miniCountdownPreload.js');
        if (!this.countdownWindow) return null;

        this.countdownWindow.loadFile(path.join(__dirname, '..', 'mini-countdown.html')).catch(error => {
            this.markUnavailable(error);
        });

        // 药丸用 -webkit-app-region: drag 交由系统拖动，窗口位置由 Windows 自己算。
        // 这里只监听 move，把提示窗口同步到新位置。
        this.countdownWindow.on('move', () => {
            this.moveHintWithCountdown(this.getCountdownBounds());
        });

        this.countdownWindow.on('closed', () => {
            this.countdownWindow = null;
            this.countdownVisible = false;
            this.pendingCountdownState = null;
        });

        // 页面尚未加载完成时收到的状态会丢失，这里缓存一次并在加载后补发。
        this.countdownWindow.webContents.on('did-finish-load', () => {
            if (this.unavailable || this.destroying) return;
            if (this.pendingCountdownState && this.countdownWindow && !this.countdownWindow.isDestroyed()) {
                this.countdownWindow.webContents.send('mini-countdown-state', this.pendingCountdownState);
                this.pendingCountdownState = null;
            }
            this.pushBackgroundTone();
        });

        return this.countdownWindow;
    }

    /**
     * 创建并加载下节课提示玻璃窗口，位置由倒计时窗口推导，不独立拖动。
     * @returns {BrowserWindow|null} 提示玻璃窗口实例
     */
    createHint() {
        if (this.unavailable || this.destroying) return null;
        if (this.hintWindow && !this.hintWindow.isDestroyed()) return this.hintWindow;

        const anchor = this.getCountdownBounds();
        this.hintWindow = this.createToolWindow({
            x: this.resolveHintPosition(anchor).x,
            y: anchor.y,
            width: MIN_WINDOW_WIDTH,
            height: anchor.height
        }, 'miniCountdownHintPreload.js');
        if (!this.hintWindow) return null;

        this.hintWindow.loadFile(path.join(__dirname, '..', 'mini-countdown-hint.html')).catch(error => {
            this.markUnavailable(error);
        });

        this.hintWindow.on('closed', () => {
            this.hintWindow = null;
            this.hintVisible = false;
            this.pendingHintName = '';
        });

        this.hintWindow.webContents.on('did-finish-load', () => {
            if (this.unavailable || this.destroying) return;
            if (this.pendingHintName && this.hintWindow && !this.hintWindow.isDestroyed()) {
                this.hintWindow.webContents.send('mini-countdown-hint-state', { hintName: this.pendingHintName });
            }
            this.pushBackgroundTone();
        });

        return this.hintWindow;
    }

    /**
     * 读取倒计时窗口的边界，尚未创建时按已知尺寸推算。
     * @returns {{x: number, y: number, width: number, height: number}} 窗口边界
     */
    getCountdownBounds() {
        const win = this.countdownWindow;
        if (win && !win.isDestroyed()) return win.getBounds();

        const { workArea } = screen.getPrimaryDisplay();
        return {
            x: Math.round(workArea.x + (workArea.width - this.countdownSize.width) / 2),
            y: windowTopFor(workArea.y, this.topSpace),
            width: this.countdownSize.width,
            height: this.countdownSize.height
        };
    }

    /**
     * 按 renderer 上报的真实内容尺寸收紧倒计时窗口。
     * @param {{width: number, height: number}} metrics 倒计时内容尺寸
     */
    resizeCountdownToContent(metrics) {
        const win = this.create();
        if (!win || win.isDestroyed()) return;
        if (!Number.isFinite(metrics?.width) || !Number.isFinite(metrics?.height)) return;

        const width = Math.max(MIN_WINDOW_WIDTH, Math.ceil(metrics.width));
        const height = Math.max(MIN_WINDOW_HEIGHT, Math.ceil(metrics.height));
        this.countdownSize = { width, height };

        const current = win.getBounds();
        const display = screen.getDisplayMatching(current);
        // 尺寸收紧时只夹右边界与下边界，不动已拖动的左/上位置：
        // 药丸可能已被用户拖到屏幕左缘，收紧尺寸不该把它弹回中间。
        // 上边界允许为负：那意味着药丸本体仍在屏幕内，只是投影留白伸到了屏幕外。
        const x = Math.min(current.x, display.workArea.x + display.workArea.width - width + GLASS_PADDING);
        const y = Math.min(current.y, display.workArea.y + display.workArea.height - height + GLASS_PADDING);

        if (current.x !== x || current.y !== y || current.width !== width || current.height !== height) {
            win.setBounds({ x, y, width, height });
        }

        this.moveHintWithCountdown({ x, y, width, height });
        this.markWindowReady(win);
    }

    /**
     * 按提示 renderer 上报的尺寸收紧提示窗口，并贴到倒计时右侧。
     * @param {{width: number, height: number}} metrics 提示内容尺寸
     */
    resizeHintToContent(metrics) {
        if (!Number.isFinite(metrics?.width) || !Number.isFinite(metrics?.height)) return;

        const hint = this.createHint();
        if (!hint || hint.isDestroyed()) return;

        const width = Math.max(MIN_WINDOW_WIDTH, Math.ceil(metrics.width));
        const height = Math.max(MIN_WINDOW_HEIGHT, Math.ceil(metrics.height));
        this.hintSize = { width, height };
        this.hintVisible = Boolean(this.lastHintName);

        const anchor = this.getCountdownBounds();
        const { x, y } = this.resolveHintPosition(anchor);

        const bounds = hint.getBounds();
        if (bounds.x !== x || bounds.y !== y || bounds.width !== width || bounds.height !== height) {
            hint.setBounds({ x, y, width, height });
        }

        this.markWindowReady(hint);
    }

    /**
     * 把窗口原点夹到允许范围内：本体四周各留 GLASS_PADDING 的投影空间，
     * 所以窗口原点可以伸到工作区外，但药丸本体不会被拖出屏幕。
     * @param {{x: number, y: number, width: number, height: number}} bounds 待夹紧的边界
     * @param {Electron.Display} display 所属显示器
     * @returns {{x: number, y: number}} 夹紧后的原点
     */
    clampBounds(bounds, display) {
        const minX = display.workArea.x - GLASS_PADDING;
        const minY = windowTopFor(display.workArea.y, this.topSpace);
        const maxX = display.workArea.x + display.workArea.width - bounds.width + GLASS_PADDING;
        const maxY = display.workArea.y + display.workArea.height - bounds.height + GLASS_PADDING;
        return {
            x: Math.round(Math.max(minX, Math.min(bounds.x, maxX))),
            y: Math.round(Math.max(minY, Math.min(bounds.y, maxY)))
        };
    }

    /**
     * 开始一次拖动会话：记录光标与窗口的相对关系，之后按帧轮询光标位置。
     *
     * 不用 -webkit-app-region: drag：工具窗口是 focusable:false 的非活动窗口，
     * Chromium 的原生拖动区不会触发系统移动循环（实测 dx 恒为 0）。
     * 也不用 renderer 的 pointermove 增量：窗口一移动 Chromium 就丢事件。
     * 光标位置由主进程自己读，指针落在窗口外的部分同样能跟住。
     *
     * @param {{x: number, y: number}} cursor 屏幕坐标下的光标位置
     */
    beginDrag(cursor) {
        if (this.suppressed || this.unavailable) return;
        const win = this.countdownWindow;
        if (!win || win.isDestroyed()) return;
        if (!Number.isFinite(cursor?.x) || !Number.isFinite(cursor?.y)) return;

        const current = win.getBounds();
        this.dragAnchor = {
            cursorX: cursor.x,
            cursorY: cursor.y,
            windowX: current.x,
            windowY: current.y,
            moved: false
        };
        this.startDragPolling();
    }

    /**
     * 结束拖动会话并停止轮询。窗口位置已在轮询中落地，这里只清理状态。
     */
    endDrag() {
        const wasDragging = this.dragAnchor !== null;
        this.dragAnchor = null;
        if (this.dragTimer) {
            clearInterval(this.dragTimer);
            this.dragTimer = null;
        }
        if (wasDragging) this.emit('drag-ended');
    }

    /**
     * 启动拖动轮询，按帧读取光标位置并推动窗口。
     */
    startDragPolling() {
        // 只清旧定时器，绝不能碰 dragAnchor：
        // beginDrag 刚写入 anchor，先 endDrag 会把它清空，
        // 轮询第一次执行就会因 anchor 为空而自我终止。
        if (this.dragTimer) clearInterval(this.dragTimer);
        this.dragTimer = setInterval(() => this.stepDrag(), DRAG_POLL_INTERVAL_MS);
    }

    /**
     * 单帧拖动推进：按当前光标位置与起点的偏移移动窗口。
     */
    stepDrag() {
        const win = this.countdownWindow;
        const anchor = this.dragAnchor;
        if (!win || win.isDestroyed() || !anchor) {
            this.endDrag();
            return;
        }

        const cursor = screen.getCursorScreenPoint();
        const current = win.getBounds();
        const desired = {
            x: anchor.windowX + (cursor.x - anchor.cursorX),
            y: anchor.windowY + (cursor.y - anchor.cursorY),
            width: current.width,
            height: current.height
        };
        const clamped = this.clampBounds(desired, screen.getDisplayMatching(desired));
        if (clamped.x === current.x && clamped.y === current.y) return;

        anchor.moved = true;
        win.setPosition(clamped.x, clamped.y);
        this.moveHintWithCountdown({ ...clamped, width: current.width, height: current.height });
    }

    /**
     * 把当前明暗判定推给两个玻璃窗口，让文字在亮底/暗底之间切换配色。
     * 尚未采样出结果时不推送，页面先用暗底默认值。
     */
    pushBackgroundTone() {
        if (this.lightBackground === null) return;

        const win = this.countdownWindow;
        if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
            win.webContents.send('mini-countdown-background-tone', { lightBackground: this.lightBackground });
        }

        const hint = this.hintWindow;
        if (hint && !hint.isDestroyed() && !hint.webContents.isLoading()) {
            hint.webContents.send('mini-countdown-hint-background-tone', { lightBackground: this.lightBackground });
        }
    }

    /**
     * 记录桌面明暗判定并推送给玻璃窗口。
     * @param {boolean} lightBackground 背后是否为亮底
     */
    setLightBackground(lightBackground) {
        const next = Boolean(lightBackground);
        if (this.lightBackground === next) return;

        this.lightBackground = next;
        this.pushBackgroundTone();
    }

    /**
     * 读取最近一次桌面明暗判定，供页面在加载后主动索取。
     * @returns {boolean|null} 背后是否为亮底
     */
    getLightBackground() {
        return this.lightBackground;
    }

    /**
     * 隐藏提示窗口并清除待发送内容，保留尺寸以便相同内容再次显示。
     */
    hideHint() {
        this.hintVisible = false;
        this.pendingHintName = '';
        const hint = this.hintWindow;
        if (hint && !hint.isDestroyed() && hint.isVisible()) hint.hide();
    }

    /**
     * 更新倒计时与提示内容并同步两个窗口的可见性。
     * @param {{visible: boolean, className: string, countdownText: string,
     *          hintVisible: boolean, hintName: string, topSpace?: number}} state 倒计时状态
     */
    applyState(state) {
        if (!state || typeof state !== 'object') return;
        if (this.unavailable || this.destroying) return;
        if (Number.isFinite(state.topSpace) && state.topSpace !== this.topSpace) {
            this.topSpace = state.topSpace;
            this.resetPosition();
        }

        const win = this.create();
        if (!win || win.isDestroyed()) return;

        this.countdownVisible = Boolean(state.visible);
        if (this.countdownVisible) {
            const payload = {
                className: state.className ?? '',
                countdownText: state.countdownText ?? '00:00'
            };
            this.lastCountdownContent = payload;
            if (win.webContents.isLoading()) {
                this.pendingCountdownState = payload;
            } else {
                this.pendingCountdownState = null;
                win.webContents.send('mini-countdown-state', payload);
            }
        } else {
            this.lastCountdownContent = null;
        }

        // 提示独立于迷你倒计时药丸：主体倒计时可见时，倒计时药丸虽然隐藏，
        // 但仍保留位置与尺寸，提示据此贴在屏幕顶部居中位置。
        const shouldShowHint = Boolean(state.hintVisible && state.hintName);
        if (!shouldShowHint) {
            this.lastHintName = '';
            this.hideHint();
            this.setVisible(this.countdownVisible);
            return;
        }

        const hintChanged = this.lastHintName !== state.hintName;
        this.lastHintName = state.hintName;
        // 提示窗口按需创建：只在真正需要显示提示时才付出一次窗口创建代价。
        const hint = this.createHint();
        if (hint && !hint.isDestroyed()) {
            this.hintVisible = true;
            this.pendingHintName = state.hintName;
            if (hintChanged && !hint.webContents.isLoading()) {
                hint.webContents.send('mini-countdown-hint-state', { hintName: state.hintName });
            }
            this.moveHintWithCountdown(this.getCountdownBounds());
        }

        this.setVisible(this.countdownVisible);
    }

    /**
     * 同步两个玻璃窗口的可见性，考试期间或故障后统一保持隐藏。
     * @param {boolean} visible 倒计时是否可见
     */
    setVisible(visible) {
        const canShow = !this.suppressed && !this.unavailable && !this.destroying;
        const win = this.countdownWindow;
        if (win && !win.isDestroyed()) {
            const shouldShow = canShow && visible && this.readyWindows.has(win);
            if (shouldShow && !win.isVisible()) win.showInactive();
            else if (!shouldShow && win.isVisible()) win.hide();
        }

        const hint = this.hintWindow;
        if (hint && !hint.isDestroyed()) {
            const shouldShow = canShow && this.hintVisible && this.readyWindows.has(hint);
            if (shouldShow && !hint.isVisible()) hint.showInactive();
            else if (!shouldShow && hint.isVisible()) hint.hide();
        }

        const windowsVisible = [win, hint].some(window =>
            window && !window.isDestroyed() && window.isVisible());
        if (windowsVisible !== this.windowsVisible) {
            this.windowsVisible = windowsVisible;
            this.emit('visibility-changed', windowsVisible);
        }
        if (!canShow || !visible) this.endDrag();
    }

    /**
     * 计算提示窗口应处的位置。
     *
     * 判定完全基于几何，不用"是否被拖动过"这类历史标志：
     *   - 药丸本体与"屏幕顶部正中央"那个候选位置有重叠：提示贴到药丸右侧。
     *     两者并排读起来最自然，也贴合药丸默认就在顶部居中的布局。
     *   - 没有重叠：提示停在屏幕顶部正中央。药丸被拖到别处时，
     *     粘在旁边的提示会跟着跑到角落甚至另一块屏，顶部居中是固定可见位置。
     *
     * 比较用的是药丸本体而非窗口矩形：窗口四周有 GLASS_PADDING 的投影留白，
     * 用窗口判定会让药丸还在视野内时提示就已经跳走。
     *
     * @param {{x: number, y: number, width: number, height: number}} anchor 倒计时边界
     * @returns {{x: number, y: number}} 提示窗口原点
     */
    resolveHintPosition(anchor) {
        const display = screen.getDisplayMatching(anchor);
        const workArea = display.workArea;

        // 提示停在顶部正中央时的候选矩形（含投影留白）。
        const centerX = Math.round(workArea.x + (workArea.width - this.hintSize.width) / 2);
        const centerY = windowTopFor(workArea.y, this.topSpace);
        const bandHeight = Math.max(anchor.height, anchor.height * HINT_TOP_BAND_RATIO);

        const overlapsTopCenter =
            anchor.x < centerX + this.hintSize.width &&
            anchor.x + anchor.width > centerX &&
            anchor.y < centerY + bandHeight &&
            anchor.y + anchor.height > centerY;

        const maxX = workArea.x + workArea.width - this.hintSize.width;

        if (overlapsTopCenter) {
            const besideX = hintLeftFor(anchor);
            // 药丸已贴近屏幕右缘时，右侧位置会被挤出屏幕；
            // 这时宁可回顶部居中，也不要让提示一半露在屏幕外。
            if (besideX <= maxX) {
                return {
                    x: besideX,
                    y: Math.round(anchor.y + (anchor.height - this.hintSize.height) / 2)
                };
            }
        }

        return {
            x: centerX,
            y: centerY
        };
    }

    /**
     * 让提示窗口跟随倒计时窗口的新位置移动，保持固定间隙。
     * @param {{x: number, y: number, width: number, height: number}} anchor 倒计时边界
     */
    moveHintWithCountdown(anchor) {
        if (!this.hintVisible || !this.hintSize.width) return;
        const hint = this.hintWindow;
        if (!hint || hint.isDestroyed()) return;

        const { x, y } = this.resolveHintPosition(anchor);

        const bounds = hint.getBounds();
        if (bounds.x !== x || bounds.y !== y) hint.setPosition(x, y);
    }

    /**
     * 把倒计时窗口恢复到主课表顶部居中的默认位置。
     */
    resetPosition() {
        const win = this.countdownWindow;
        if (!win || win.isDestroyed()) return;

        const bounds = win.getBounds();
        const { workArea } = screen.getDisplayMatching(bounds);
        const x = Math.round(workArea.x + (workArea.width - bounds.width) / 2);
        const y = windowTopFor(workArea.y, this.topSpace);

        if (bounds.x !== x || bounds.y !== y) win.setPosition(x, y);
        this.moveHintWithCountdown({ x, y, width: bounds.width, height: bounds.height });
    }

    /**
     * 让两个玻璃窗口跟随主课表的置顶策略。
     * @param {boolean} alwaysOnTop 是否置顶
     */
    setAlwaysOnTop(alwaysOnTop) {
        for (const win of [this.countdownWindow, this.hintWindow]) {
            if (!win || win.isDestroyed()) continue;
            win.setAlwaysOnTop(alwaysOnTop, 'screen-saver');
            if (alwaysOnTop && win.isVisible()) win.moveTop();
        }
    }

    /**
     * 销毁两个玻璃窗口。
     */
    destroy() {
        this.destroying = true;
        this.setVisible(false);
        for (const timer of this.readyTimers.values()) clearTimeout(timer);
        this.readyTimers.clear();
        this.readyWindows.clear();
        this.endDrag();
        for (const win of [this.countdownWindow, this.hintWindow]) {
            if (win && !win.isDestroyed()) win.destroy();
        }
        this.countdownWindow = null;
        this.hintWindow = null;
        this.countdownVisible = false;
        this.hintVisible = false;
        this.pendingCountdownState = null;
        this.pendingHintName = '';
        this.lightBackground = null;
    }

    /**
     * 获取倒计时玻璃窗口实例。
     * @returns {BrowserWindow|null} 倒计时玻璃窗口
     */
    getWindow() {
        return this.countdownWindow;
    }

    /**
     * 获取下节课提示玻璃窗口实例。
     * @returns {BrowserWindow|null} 提示玻璃窗口
     */
    getHintWindow() {
        return this.hintWindow;
    }

    /**
     * 返回最近一次下发的倒计时内容。
     * 页面在 did-finish-load 之后主动索取，避免补发与监听注册之间的竞态。
     * @returns {{className: string, countdownText: string}|null} 倒计时内容
     */
    getCountdownContent() {
        return this.lastCountdownContent;
    }

    /**
     * 返回最近一次下发的下一节课名称。
     * @returns {string} 课程名称，空字符串表示当前无提示
     */
    getHintName() {
        return this.lastHintName;
    }
}

module.exports = MiniCountdownGlassWindow;
