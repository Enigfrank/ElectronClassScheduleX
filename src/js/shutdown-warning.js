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
    let interval = null;
    let unsubscribeInit = () => {};

    /**
     * 刷新页面中的剩余秒数。
     */
    function renderCountdown() {
        countdownElement.textContent = String(Math.max(0, seconds));
    }

    /**
     * 启动每秒递减的关机预警倒计时。
     */
    function startCountdown() {
        renderCountdown();
        interval = window.setInterval(() => {
            seconds -= 1;
            renderCountdown();
            if (seconds <= 0) {
                window.clearInterval(interval);
                interval = null;
            }
        }, 1000);
    }

    /**
     * 接收主进程发送的目标关机时间。
     * @param {{targetTime?: string}} payload 初始化数据
     */
    function handleInit(payload) {
        targetTimeElement.textContent = typeof payload?.targetTime === 'string'
            ? payload.targetTime
            : '';
    }

    /**
     * 停止倒计时并执行一项关机预警操作。
     * @param {() => void} action 预警操作
     */
    function runAction(action) {
        if (interval !== null) {
            window.clearInterval(interval);
            interval = null;
        }
        action();
    }

    /**
     * 清理倒计时和 IPC 订阅。
     */
    function cleanup() {
        if (interval !== null) window.clearInterval(interval);
        unsubscribeInit();
    }

    /**
     * 初始化关机预警页面交互。
     */
    function initialize() {
        unsubscribeInit = api.onInit(handleInit);

        delay30Button.addEventListener('click', () => runAction(api.delay30));
        delay60Button.addEventListener('click', () => runAction(api.delay60));
        cancelButton.addEventListener('click', () => runAction(api.cancel));
        window.addEventListener('beforeunload', cleanup, { once: true });
        startCountdown();
    }

    initialize();
}());
