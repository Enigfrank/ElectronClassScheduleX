(function initMiniCountdownHintWindow() {
    const ipcRenderer = window.miniCountdownHintApi;
    const pill = document.getElementById('hintPill');
    const hintNameElement = document.getElementById('nextClassName');
    const root = document.documentElement;

    let lastReportedSize = null;

    /**
     * 把课表配置中的 CSS 变量同步到本窗口，保证与倒计时玻璃使用同一套字号与圆角。
     * @param {Record<string, string>} cssStyle 课表样式变量
     */
    function applyStyleVariables(cssStyle) {
        if (!cssStyle || typeof cssStyle !== 'object') return;
        for (const key in cssStyle) {
            root.style.setProperty(key, cssStyle[key]);
        }
    }

    /**
     * 按桌面明暗切换文字配色，与倒计时药丸保持同一套亮底/暗底规则。
     * @param {boolean} lightBackground 背后是否为亮底
     */
    function applyBackgroundTone(lightBackground) {
        document.body.classList.toggle('lightBackground', lightBackground === true);
    }

    /**
     * 上报窗口所需大小，供主进程把窗口收紧到内容大小。
     *
     * 量的对象是 body 而不是 .hintPill：body 额外含 --glass-shadow-space 的
     * padding，用来容纳药丸投影，否则投影会被窗口边缘裁成硬边。
     *
     * 由 ResizeObserver 跟踪文字及字体造成的实际尺寸变化。
     */
    function reportSize() {
        const rect = document.body.getBoundingClientRect();
        const metrics = {
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height)
        };
        if (lastReportedSize?.width === metrics.width && lastReportedSize?.height === metrics.height) return;
        lastReportedSize = metrics;
        ipcRenderer.send('mini-countdown-hint-ready', metrics);
    }

    const sizeObserver = new ResizeObserver(reportSize);
    sizeObserver.observe(document.body, { box: 'border-box' });

    /**
     * 应用主课表推送的下一节课名称，并同步窗口尺寸。
     * 首个参数是 preload 保留的事件占位符，状态对象是第二个参数。
     * @param {{hintName: string}} state 提示内容
     */
    function applyState(_event, state) {
        if (!state || typeof state !== 'object') return;
        const hintName = state.hintName ?? '';
        if (hintNameElement.textContent !== hintName) hintNameElement.textContent = hintName;
    }

    ipcRenderer.on('mini-countdown-hint-state', applyState);
    ipcRenderer.on('mini-countdown-hint-background-tone', (_event, tone) => {
        applyBackgroundTone(tone?.lightBackground);
    });

    ipcRenderer.invoke('mini-countdown-hint-pull-state')
        .then(state => { if (state) applyState(undefined, state); })
        .catch(() => {});

    ipcRenderer.invoke('mini-countdown-hint-pull-background-tone')
        .then(tone => { if (tone) applyBackgroundTone(tone.lightBackground); })
        .catch(() => {});

    /**
     * 读取课表配置中的样式变量，再上报提示药丸尺寸。
     */
    async function bootstrap() {
        try {
            const result = await ipcRenderer.invoke('load-schedule-config');
            if (result?.success) {
                applyStyleVariables(result.config?.css_style);
            }
        } catch (error) {
            console.error('[迷你倒计时] 读取提示样式失败:', error);
        }
        reportSize();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }
}());
