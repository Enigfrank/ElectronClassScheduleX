/**
 * 暴露主进程与关机预警 renderer 共用的倒计时合同。
 * @param {Object} root 浏览器或 Node 全局对象
 */
(function initializeShutdownWarning(root) {
    const WARNING_COUNTDOWN_SECONDS = 15;
    const MILLISECONDS_PER_SECOND = 1000;
    const WARNING_DURATION_MS = WARNING_COUNTDOWN_SECONDS * MILLISECONDS_PER_SECOND;

    const api = Object.freeze({
        WARNING_COUNTDOWN_SECONDS,
        WARNING_DURATION_MS
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ECSXShutdownWarning = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
