const { desktopCapturer, screen } = require('electron');

/**
 * 桌面亮度采样参数。
 *
 * 采样分辨率按屏幕宽高的 1/8 缩到几百像素即可：这里只需要判断
 * "亮底还是暗底"，不需要真实像素，原分辨率截图纯属浪费。
 */
const THUMBNAIL_DIVISOR = 8;
/**
 * 采样间隔。
 *
 * desktopCapturer.getSources 的耗时与缩略图尺寸无关（实测 240x135 与 60x34
 * 均为约 108ms），成本全在向 DWM 枚举全部窗口源上，靠缩小缩略图省不下来。
 * 实测每次调用占掉约一个核的 11%，在常驻程序里不可接受，频率必须压低。
 * 药丸不在移动时配色本来就不会变，5 秒一次足够。
 */
const SAMPLE_INTERVAL_MS = 5000;
/**
 * 中位亮度高于该值判定为亮底：文字改用深色，否则白色文字在白底上不可见。
 * 128 是感知亮度中点。阈值两侧留出 HYSTERESIS 的死区，
 * 只有亮度明显越过边界才翻转，桌面轻微闪动不会让文字反复变色。
 */
const LIGHT_BACKGROUND_THRESHOLD = 128;
const HYSTERESIS = 16;

/**
 * 桌面亮度采样器：为透明玻璃窗口判断背后是亮底还是暗底。
 *
 * 玻璃面近乎无色（白 6%），文字对比度完全由背后的桌面决定。
 * 白色文字在白色背景上不可读，所以必须由主进程采样桌面亮度，
 * 把结果推给 renderer 切换深/浅文字——renderer 自己看不到桌面，
 * 窗口是透明的，页面内没有任何可用的背景信息。
 */
class DesktopLumaSampler {
    /**
     * @param {{info: Function, warn: Function, error: Function}} logger 日志记录器
     * @param {{resolveDisplay?: Function}} [options] 可选配置
     */
    constructor(logger, options = {}) {
        this.logger = logger;
        this.timer = null;
        this.running = false;
        this.active = false;
        this.generation = 0;
        this.busy = false;
        this.lastLuma = null;
        this.lastLight = null;
        this.dragging = false;
        // 药丸可以被拖到副屏，副屏壁纸可能与主屏完全不同，
        // 所以采样目标必须跟着药丸所在显示器走，而不是写死主屏。
        this.resolveDisplay = options.resolveDisplay || (() => screen.getPrimaryDisplay());
        // 药丸与提示窗口本身是屏幕上的图层：desktopCapturer 会把它们一起拍进来。
        // 不排除这两块矩形，采样到的就是玻璃与投影，判定会在明暗之间来回跳。
        this.resolveExclusions = options.resolveExclusions || (() => []);
        // 采样带必须跟着药丸走。若固定在屏幕顶部中央，
        // 药丸拖到白底区域后采样到的仍是深色壁纸，文字永远不会变色。
        this.resolveAnchor = options.resolveAnchor || (() => null);
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
     * 把 0-255 的亮度映射为"文字该用深色还是浅色"。
     *
     * 带死区：已经判定为亮底时，必须跌破 128-HYSTERESIS 才翻回暗底，
     * 反之亦然。没有死区的话，亮度在阈值附近抖动会让文字一秒一变。
     * @param {number} luma 感知亮度
     * @returns {boolean} true 表示背后是亮底，文字需要用深色
     */
    isLightBackground(luma) {
        if (this.lastLight === true) return luma >= LIGHT_BACKGROUND_THRESHOLD - HYSTERESIS;
        if (this.lastLight === false) return luma >= LIGHT_BACKGROUND_THRESHOLD + HYSTERESIS;
        return luma >= LIGHT_BACKGROUND_THRESHOLD;
    }

    /**
     * 计算药丸周边（排除药丸与提示窗口自身）中位亮度。
     *
     * 采样带以药丸当前位置为中心，取其上下各一段的邻域。desktopCapturer 拍的
     * 是合成后的桌面，药丸与提示窗口也在画面里，若不排除这两块矩形，
     * 采到的中位数就是玻璃面与投影的亮度，判定会随药丸出现而抖动。
     *
     * @param {Electron.DesktopCapturerSource} source 屏幕源
     * @param {Electron.Display} display 药丸所在显示器
     * @param {{x: number, y: number, width: number, height: number}[]} exclusions 需要排除的屏幕矩形
     * @param {{x: number, y: number, width: number, height: number}|null} anchor 采样中心
     * @returns {Promise<number|null>} 中位亮度，取不到时返回 null
     */
    async measureLuma(source, display, exclusions, anchor) {
        const thumbnail = source.thumbnail;
        if (!thumbnail || thumbnail.isEmpty()) return null;

        const size = thumbnail.getSize();
        const bmp = thumbnail.toBitmap();
        const W = size.width;
        const H = size.height;

        // 屏幕坐标 -> 缩略图坐标。显示器原点不是 0（副屏可能是负坐标），
        // 必须先减去显示器原点再按缩略图比例换算。
        const scaleX = W / display.size.width;
        const scaleY = H / display.size.height;
        // 采样邻域必须明显大于药丸窗口。
        //
        // 两个尺寸都不能贴着窗口边缘取：玻璃投影外扩到约 32px（y 偏移 8 + 模糊 24），
        // 采样带一旦落进投影里，采到的就是被压暗的桌面，
        // 白底也会被判成暗底，表现为"拖到白底不变色"。
        // 下面按缩略图比例给足余量，保证采到的全是真实桌面像素。
        const padX = Math.max(48, Math.round(W * 0.12));
        const padY = Math.max(12, Math.round(H * 0.10));
        const centerX = anchor ? Math.round((anchor.x + anchor.width / 2 - display.bounds.x) * scaleX) : Math.round(W / 2);
        const centerY = anchor ? Math.round((anchor.y + anchor.height / 2 - display.bounds.y) * scaleY) : Math.round(H * 0.02);
        const bandLeft = Math.max(0, centerX - padX);
        const bandRight = Math.min(W - 1, centerX + padX);
        const bandTop = Math.max(0, centerY - padY);
        const bandBottom = Math.min(H - 1, centerY + padY);

        const excluded = exclusions
            .filter(Boolean)
            .map(rect => ({
                left: Math.floor((rect.x - display.bounds.x) * scaleX),
                right: Math.ceil((rect.x + rect.width - display.bounds.x) * scaleX),
                top: Math.floor((rect.y - display.bounds.y) * scaleY),
                bottom: Math.ceil((rect.y + rect.height - display.bounds.y) * scaleY)
            }));

        const lumaSamples = [];
        for (let y = bandTop; y <= bandBottom; y++) {
            for (let x = bandLeft; x <= bandRight; x++) {
                if (excluded.some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) continue;
                const i = (y * W + x) * 4;
                // Rec.709 亮度权重。Electron 的 toBitmap 返回 BGRA 排列，
                // 若按 RGBA 取权重会把红蓝颠倒，彩色壁纸上的明暗会判反。
                lumaSamples.push(
                    0.2126 * bmp[i + 2] + 0.7152 * bmp[i + 1] + 0.0722 * bmp[i]
                );
            }
        }
        if (lumaSamples.length === 0) return null;

        // 取中位数而不是均值：桌面上一块亮色图标不该把整条判定拉亮。
        lumaSamples.sort((a, b) => a - b);
        return lumaSamples[Math.floor(lumaSamples.length / 2)];
    }

    /**
     * 采样一次桌面亮度。
     * @returns {Promise<number|null>} 中位亮度，取不到时返回 null
     */
    async sample() {
        const display = this.resolveDisplay() || screen.getPrimaryDisplay();
        const { width, height } = display.size;
        let sources;
        try {
            sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: {
                    width: Math.max(1, Math.round(width / THUMBNAIL_DIVISOR)),
                    height: Math.max(1, Math.round(height / THUMBNAIL_DIVISOR))
                },
                fetchWindowIcons: false
            });
        } catch (error) {
            this.log('warn', `[桌面亮度] 采样失败: ${error.message}`);
            return null;
        }

        const source = sources.find(item => item.display_id === String(display.id)) || sources[0];
        if (!source) return null;

        const exclusions = this.resolveExclusions(display) || [];
        const anchor = this.resolveAnchor();
        return this.measureLuma(source, display, exclusions, anchor);
    }

    /**
     * 启动采样服务，仅在窗口激活时截图；重复启动替换回调并使旧结果失效。
     * @param {(lightBackground: boolean) => void} onChange 明暗翻转回调
     */
    start(onChange) {
        this.generation += 1;
        this.running = true;
        this.onChange = onChange;
        this.lastLight = null;
        this.tick();
        this.restartTimer();
    }

    /**
     * 串行采样，并且只提交当前生命周期的结果。
     * @private
     */
    async tick() {
        if (!this.running || !this.active || this.dragging || this.busy) return;
        const generation = this.generation;
        this.busy = true;
        try {
            const luma = await this.sample();
            if (generation !== this.generation || !this.running || !this.active || this.dragging) return;
            if (luma === null) return;

            this.lastLuma = luma;
            const light = this.isLightBackground(luma);
            // 死区已经吸收了阈值附近的抖动，这里只在判定真的翻转时推送。
            if (this.lastLight === null || light !== this.lastLight) {
                this.lastLight = light;
                this.log('info', `[桌面亮度] 背后${light ? '亮底' : '暗底'} luma=${luma.toFixed(1)}`);
                this.onChange?.(light);
            }
        } catch (error) {
            this.log('warn', `[桌面亮度] 采样异常: ${error.message}`);
        } finally {
            this.busy = false;
            // 激活或松手时旧请求可能仍在途；释放 busy 后立即补采当前生命周期。
            if (generation !== this.generation) this.tick();
        }
    }

    /**
     * 仅在服务运行、窗口激活且未拖动时维持五秒采样周期。
     * @private
     */
    restartTimer() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (!this.running || !this.active || this.dragging) return;
        this.timer = setInterval(() => this.tick(), SAMPLE_INTERVAL_MS);
        this.timer.unref?.();
    }

    /**
     * 根据玻璃窗口整体可见性切换采样，停用时丢弃在途结果并清理拖动态。
     * @param {boolean} active 是否需要桌面亮度
     */
    setActive(active) {
        const next = Boolean(active);
        if (this.active === next) return;
        this.active = next;
        this.generation += 1;
        if (!next) this.dragging = false;
        this.restartTimer();
        if (next) this.tick();
    }

    /**
     * 切换拖动态。
     *
     * 拖动开始时清除周期采样，拖动结束时立刻补采一次：
     * 采样锚点跟着药丸走，所以落下之后的那一次采样拿到的就是新位置的底色。
     * @param {boolean} dragging 是否正在拖动
     */
    setDragging(dragging) {
        if (!this.running || !this.active) return;
        const next = Boolean(dragging);
        if (this.dragging === next) return;
        this.dragging = next;
        this.generation += 1;
        this.restartTimer();
        if (!next) this.tick();
    }

    /**
     * 停止采样服务，丢弃在途结果并清除后续调度。
     */
    stop() {
        this.generation += 1;
        this.running = false;
        this.active = false;
        this.dragging = false;
        this.onChange = null;
        this.restartTimer();
    }
}

module.exports = DesktopLumaSampler;
