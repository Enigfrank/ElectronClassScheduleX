(function initializeShutdownWarningRenderer() {
    const domain = window.ECSXShutdownWarning;
    const api = window.shutdownWarningApi;
    const countdownElement = document.querySelector('.countdown');
    const targetTimeElement = document.getElementById('targetTime');
    const delay30Button = document.getElementById('btn30');
    const delay60Button = document.getElementById('btn60');
    const cancelButton = document.getElementById('btnClose');

    if (!domain) throw new Error('Shutdown warning shared contract is unavailable');
    if (!api) throw new Error('Shutdown warning preload API is unavailable');

    let seconds = domain.WARNING_COUNTDOWN_SECONDS;
    let countdownTimer = null;
    let targetTimestamp = null;
    let unsubscribeInit = () => {};
    let planId = '';

    /**
     * 刷新页面中的剩余秒数。
     */
    function renderCountdown() {
        countdownElement.textContent = String(Math.max(0, seconds));
    }

    /**
     * 按实际关机时间计算剩余秒数，并与课表倒计时一样对齐系统整秒刷新。
     */
    function startCountdown() {
        if (countdownTimer !== null) window.clearTimeout(countdownTimer);
        countdownTimer = null;
        const now = Date.now();
        seconds = Math.max(0, Math.ceil((targetTimestamp - now) / 1000));
        renderCountdown();
        if (seconds > 0) {
            countdownTimer = window.setTimeout(startCountdown, 1000 - now % 1000);
        }
    }

    /**
     * 接收主进程发送的目标关机时间。
     * @param {{planId?: string, targetTime?: string, targetTimestamp?: number}} payload 初始化数据
     */
    function handleInit(payload) {
        planId = typeof payload?.planId === 'string' ? payload.planId : '';
        targetTimeElement.textContent = typeof payload?.targetTime === 'string'
            ? payload.targetTime
            : '';
        if (Number.isFinite(payload?.targetTimestamp)) {
            targetTimestamp = payload.targetTimestamp;
            startCountdown();
        }
    }

    /**
     * 停止倒计时并执行一项关机预警操作。
     * @param {() => void} action 预警操作
     */
    function runAction(action) {
        if (countdownTimer !== null) {
            window.clearTimeout(countdownTimer);
            countdownTimer = null;
        }
        action();
    }

    /**
     * 清理倒计时和 IPC 订阅。
     */
    function cleanup() {
        if (countdownTimer !== null) window.clearTimeout(countdownTimer);
        unsubscribeInit();
    }

    /**
     * 初始化关机预警页面交互。
     */
    function initialize() {
        unsubscribeInit = api.onInit(handleInit);

        delay30Button.addEventListener('click', () => runAction(() => api.delay30(planId)));
        delay60Button.addEventListener('click', () => runAction(() => api.delay60(planId)));
        cancelButton.addEventListener('click', () => runAction(() => api.cancel(planId)));
        window.addEventListener('beforeunload', cleanup, { once: true });
        renderCountdown();
    }

    initialize();
}());
