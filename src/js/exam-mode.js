(function initializeExamModeRenderer() {
    const domain = window.ECSXExamMode;
    const api = window.examMode;
    const infoElement = document.getElementById('exam-info');
    const clockElement = document.getElementById('exam-clock');
    const exitTrigger = document.getElementById('exam-exit-trigger');
    const exitLayer = document.getElementById('exam-exit-layer');
    const exitCancel = document.getElementById('exam-exit-cancel');
    const exitConfirm = document.getElementById('exam-exit-confirm');
    const exitError = document.getElementById('exam-exit-error');

    let entries = [];
    let initialized = false;
    let initializationFailed = false;
    let tickTimer = null;
    let exitLayerHideTimer = null;
    let unsubscribeInit = () => {};
    let resizeObserver = null;

    /**
     * 读取 CSS 像素令牌。
     * @param {string} name CSS 变量名
     * @param {number} fallback 无法读取时的回退值
     * @returns {number} 像素值
     */
    function readPixelToken(name, fallback) {
        const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
        return Number.isFinite(value) ? value : fallback;
    }

    /**
     * 按中央可用宽度缩小信息行字体，保持科目与时间段同一行。
     */
    function fitInfoText() {
        const maximumSize = readPixelToken('--text-exam-info', 40);
        const minimumSize = readPixelToken('--text-exam-info-min', 24);
        infoElement.style.fontSize = `${maximumSize}px`;

        const availableWidth = infoElement.clientWidth;
        const contentWidth = infoElement.scrollWidth;
        if (!availableWidth || contentWidth <= availableWidth) return;

        const fittedSize = Math.max(minimumSize, Math.floor(maximumSize * availableWidth / contentWidth));
        infoElement.style.fontSize = `${fittedSize}px`;
    }

    /**
     * 格式化一条考试科目和时间段。
     * @param {{subject: string, startTime: string, endTime: string}} entry 考试条目
     * @returns {string} 同行展示文本
     */
    function formatEntry(entry) {
        return `${entry.subject}  ${entry.startTime}-${entry.endTime}`;
    }

    /**
     * 根据当前本机时间刷新考试状态和时钟。
     * @param {Date} now 当前本机时间
     */
    function render(now) {
        const clockText = domain?.formatExamClock(now) || '--:--:--';
        clockElement.textContent = clockText;
        clockElement.dateTime = clockText;

        if (initializationFailed) {
            infoElement.textContent = '考试安排加载失败';
        } else if (!initialized) {
            infoElement.textContent = '正在加载考试安排';
        } else {
            const state = domain.resolveExamDisplayState(entries, now);
            if (state.status === 'current') {
                infoElement.textContent = formatEntry(state.entry);
            } else if (state.status === 'next') {
                infoElement.textContent = `下一场：${formatEntry(state.entry)}`;
            } else {
                infoElement.textContent = '今日考试已结束';
            }
        }

        fitInfoText();
    }

    /**
     * 对齐下一整秒安排时钟刷新，避免 setInterval 长期漂移。
     */
    function scheduleNextTick() {
        const remainder = Date.now() % 1000;
        const delay = remainder === 0 ? 1000 : 1000 - remainder;
        tickTimer = window.setTimeout(() => {
            render(new Date());
            scheduleNextTick();
        }, delay);
    }

    /**
     * 接收并验证主进程发送的考试安排。
     * @param {*} input 未信任的初始化数据
     */
    function handleInit(input) {
        const result = domain?.normalizeExamEntries(input);
        if (!result?.valid) {
            initializationFailed = true;
            initialized = false;
            entries = [];
        } else {
            initializationFailed = false;
            initialized = true;
            entries = result.entries;
        }
        render(new Date());
    }

    /**
     * 打开触控退出确认层。
     */
    function openExitLayer() {
        if (exitLayerHideTimer !== null) {
            window.clearTimeout(exitLayerHideTimer);
            exitLayerHideTimer = null;
        }
        exitError.hidden = true;
        exitError.textContent = '';
        exitLayer.hidden = false;
        window.requestAnimationFrame(() => {
            exitLayer.classList.add('is-visible');
            exitCancel.focus();
        });
    }

    /**
     * 关闭退出确认层并回到考试展示。
     */
    function closeExitLayer() {
        if (exitLayerHideTimer !== null) {
            window.clearTimeout(exitLayerHideTimer);
        }
        exitLayer.classList.remove('is-visible');
        exitLayerHideTimer = window.setTimeout(() => {
            exitLayer.hidden = true;
            exitLayerHideTimer = null;
            exitTrigger.focus();
        }, 160);
    }

    /**
     * 确认退出并把结果错误保留在确认层内。
     * @returns {Promise<void>} 退出请求完成
     */
    async function confirmExit() {
        exitConfirm.disabled = true;
        exitCancel.disabled = true;
        exitError.hidden = true;
        exitLayer.setAttribute('aria-busy', 'true');

        try {
            const result = await api.exitExamMode();
            if (!result?.success) throw new Error(result?.error || '主进程未能退出考试模式');
        } catch (error) {
            exitError.textContent = error instanceof Error ? error.message : String(error);
            exitError.hidden = false;
            exitConfirm.disabled = false;
            exitCancel.disabled = false;
            exitLayer.removeAttribute('aria-busy');
        }
    }

    /**
     * 清理计时器、IPC 监听和尺寸观察器。
     */
    function cleanup() {
        if (tickTimer !== null) window.clearTimeout(tickTimer);
        if (exitLayerHideTimer !== null) window.clearTimeout(exitLayerHideTimer);
        unsubscribeInit();
        resizeObserver?.disconnect();
        window.removeEventListener('resize', fitInfoText);
    }

    /**
     * 初始化考试展示交互和时钟。
     */
    function initialize() {
        if (!domain || !api) {
            initializationFailed = true;
        } else {
            unsubscribeInit = api.onInit(handleInit);
            api.ready();
        }

        exitTrigger.addEventListener('click', openExitLayer);
        exitCancel.addEventListener('click', closeExitLayer);
        exitConfirm.addEventListener('click', confirmExit);
        window.addEventListener('beforeunload', cleanup, { once: true });

        if (typeof ResizeObserver === 'function') {
            resizeObserver = new ResizeObserver(fitInfoText);
            resizeObserver.observe(infoElement);
        } else {
            window.addEventListener('resize', fitInfoText);
        }

        render(new Date());
        scheduleNextTick();
    }

    initialize();
}());
