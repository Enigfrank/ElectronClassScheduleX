const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createUpdateStatus,
    formatDownloadProgress
} = require('../src/modules/update/updateStatus');

test('creates default idle update status', () => {
    assert.deepEqual(createUpdateStatus(), {
        state: 'idle',
        message: '未检查更新',
        currentVersion: '',
        latestVersion: '',
        sourceId: '',
        error: '',
        progress: null
    });
});

test('allows explicit status overrides', () => {
    assert.deepEqual(createUpdateStatus({ state: 'checking', message: '正在检查更新' }), {
        state: 'checking',
        message: '正在检查更新',
        currentVersion: '',
        latestVersion: '',
        sourceId: '',
        error: '',
        progress: null
    });
});

test('formats download progress values for GUI display', () => {
    assert.deepEqual(formatDownloadProgress({
        percent: 12.345,
        bytesPerSecond: 2048,
        transferred: 1048576,
        total: 2097152
    }), {
        percent: 12.35,
        bytesPerSecond: 2048,
        transferred: 1048576,
        total: 2097152,
        transferredText: '1.00 MB',
        totalText: '2.00 MB',
        speedText: '2.00 KB/s'
    });
});
