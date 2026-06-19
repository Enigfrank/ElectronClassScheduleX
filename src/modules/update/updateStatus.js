/**
 * 将字节数格式化为适合界面展示的文本。
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的容量文本
 */
function formatBytes(bytes) {
    const value = Number(bytes) || 0;

    if (value >= 1024 * 1024) {
        return `${(value / 1024 / 1024).toFixed(2)} MB`;
    }

    if (value >= 1024) {
        return `${(value / 1024).toFixed(2)} KB`;
    }

    return `${value} B`;
}

/**
 * 创建标准化更新状态对象。
 * @param {object} overrides 覆盖字段
 * @returns {object} 更新状态
 */
function createUpdateStatus(overrides = {}) {
    return {
        state: 'idle',
        message: '未检查更新',
        currentVersion: '',
        latestVersion: '',
        sourceId: '',
        error: '',
        progress: null,
        ...overrides
    };
}

/**
 * 将下载进度格式化为 GUI 可直接展示的结构。
 * @param {object} progress 下载进度
 * @returns {object} 格式化进度
 */
function formatDownloadProgress(progress = {}) {
    const percent = Math.round((Number(progress.percent) || 0) * 100) / 100;
    const bytesPerSecond = Number(progress.bytesPerSecond) || 0;
    const transferred = Number(progress.transferred) || 0;
    const total = Number(progress.total) || 0;

    return {
        percent,
        bytesPerSecond,
        transferred,
        total,
        transferredText: formatBytes(transferred),
        totalText: formatBytes(total),
        speedText: `${formatBytes(bytesPerSecond)}/s`
    };
}

module.exports = {
    createUpdateStatus,
    formatDownloadProgress,
    formatBytes
};
