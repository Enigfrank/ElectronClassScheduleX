(function initMiniCountdownWindow() {
    const ipcRenderer = window.miniCountdownApi;
    const pill = document.getElementById('glassPill');
    const classNameElement = document.getElementById('miniClassName');
    const countdownElement = document.getElementById('miniCountdownText');
    const root = document.documentElement;

    let lastReportedSize = null;
    let dragging = false;

    /**
     * 结束一次拖动并复位指针捕获。
     *
     * 必须同时监听原生 mouseup：拖动中指针会离开本窗口，
     * pointerup 可能收不到，若不兜底轮询会一直转下去。
     */
    function handleDragEnd() {
        if (!dragging) return;
        dragging = false;
        pill.classList.remove('dragging');
        ipcRenderer.send('mini-countdown-drag', 'end');
    }

    /**
     * 开始一次拖动。药丸是窗口内唯一可交互表面，
     * 因此 pointerdown 无条件进入拖动态。
     * @param {PointerEvent} event 指针事件
     */
    function handlePointerDown(event) {
        if (!event.isPrimary || dragging) return;
        dragging = true;
        pill.classList.add('dragging');
        pill.setPointerCapture(event.pointerId);
        ipcRenderer.send('mini-countdown-drag', 'start');
        event.preventDefault();
    }

    /**
     * 把课表配置中的 CSS 变量同步到本窗口，保证玻璃表面沿用用户自定义的圆角、字号与内边距。
     * @param {Record<string, string>} cssStyle 课表样式变量
     */
    function applyStyleVariables(cssStyle) {
        if (!cssStyle || typeof cssStyle !== 'object') return;
        for (const key in cssStyle) {
            root.style.setProperty(key, cssStyle[key]);
        }
    }

    /**
     * 按桌面明暗切换文字配色。
     *
     * 玻璃面近乎无色，白字在白底上完全不可读；改成深字而不是调暗玻璃面，
     * 因为玻璃面一旦变暗就失去通透感，又回到之前那种塑料感。
     * @param {boolean} lightBackground 背后是否为亮底
     */
    function applyBackgroundTone(lightBackground) {
        document.body.classList.toggle('lightBackground', lightBackground === true);
    }

    /**
     * 上报窗口所需大小。
     *
     * 量的对象是 body 而不是 .glassPill：body 额外含 --glass-shadow-space 的
     * padding，用来容纳药丸投影。窗口按 body 收紧，投影才不会被裁成硬边。
     *
     * ResizeObserver 在布局或字体改变真实尺寸后调用，避免每秒强制测量。
     */
    function reportSize() {
        const rect = document.body.getBoundingClientRect();
        const metrics = {
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height)
        };
        if (lastReportedSize?.width === metrics.width && lastReportedSize?.height === metrics.height) return;
        lastReportedSize = metrics;
        ipcRenderer.send('mini-countdown-ready', metrics);
    }

    const sizeObserver = new ResizeObserver(reportSize);
    sizeObserver.observe(document.body, { box: 'border-box' });

    /**
     * 应用主课表推送的倒计时内容；尺寸随文字长度变化，需重新上报。
     * 首个参数是 preload 保留的事件占位符，状态对象是第二个参数。
     * @param {{className: string, countdownText: string}} state 倒计时内容
     */
    function applyState(_event, state) {
        if (!state || typeof state !== 'object') return;
        const className = state.className ?? '';
        const countdownText = state.countdownText ?? '00:00';
        if (classNameElement.textContent !== className) classNameElement.textContent = className;
        if (countdownElement.textContent !== countdownText) countdownElement.textContent = countdownText;
    }

    ipcRenderer.on('mini-countdown-state', applyState);
    ipcRenderer.on('mini-countdown-background-tone', (_event, tone) => {
        applyBackgroundTone(tone?.lightBackground);
    });

    // 主进程在 did-finish-load 之后补发状态，此时本页脚本可能刚执行完。
    // 主动索取一次最新状态，避免补发与监听注册之间出现竞态导致内容为空。
    ipcRenderer.invoke('mini-countdown-pull-state')
        .then(state => { if (state) applyState(undefined, state); })
        .catch(() => {});

    ipcRenderer.invoke('mini-countdown-pull-background-tone')
        .then(tone => { if (tone) applyBackgroundTone(tone.lightBackground); })
        .catch(() => {});

    /**
     * 读取课表配置中的样式变量，再向主进程报告药丸真实尺寸。
     */
    async function bootstrap() {
        try {
            const result = await ipcRenderer.invoke('load-schedule-config');
            if (result?.success) {
                applyStyleVariables(result.config?.css_style);
            }
        } catch (error) {
            console.error('[迷你倒计时] 读取课表样式失败:', error);
        }
        reportSize();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }

    pill.addEventListener('pointerdown', handlePointerDown);
    pill.addEventListener('pointerup', handleDragEnd);
    pill.addEventListener('pointercancel', handleDragEnd);
    // 指针移出窗口后 pointerup 会丢，用原生 mouseup 保证拖动一定收尾。
    document.addEventListener('mouseup', handleDragEnd);
}());
