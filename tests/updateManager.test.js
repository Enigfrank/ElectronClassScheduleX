const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

/**
 * 在 Node 测试环境中加载带 Electron app 替身的 UpdateManager。
 * @returns {Function} UpdateManager 类
 */
function loadUpdateManagerWithElectronApp() {
    const updateManagerPath = require.resolve('../src/modules/updateManager');
    const originalLoad = Module._load;

    delete require.cache[updateManagerPath];
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === 'electron') {
            return {
                app: {
                    isPackaged: false,
                    getVersion: () => '1.6.0'
                }
            };
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require('../src/modules/updateManager');
    } finally {
        Module._load = originalLoad;
    }
}

const UpdateManager = loadUpdateManagerWithElectronApp();

/**
 * 创建用于测试的配置管理器替身。
 * @param {object} overrides 覆盖设置
 * @returns {object} 配置管理器替身
 */
function createConfigManager(overrides = {}) {
    const settings = {
        autoCheckUpdates: true,
        useUpdateProxy: true,
        updateProxyId: 'gh-proxy-v4',
        customUpdateProxyPrefix: '',
        ...overrides
    };

    return {
        get(key) {
            return settings[key];
        },
        getUpdateSettings() {
            return { ...settings };
        },
        setUpdateSettings(patch = {}) {
            Object.assign(settings, patch);
            return { ...settings };
        }
    };
}

/**
 * 创建用于观察 updater 调用的替身。
 * @returns {{updater: object, calls: object}} updater 替身和调用计数
 */
function createUpdaterDouble() {
    const calls = {
        downloadUpdate: 0,
        quitAndInstall: 0
    };
    const updater = {
        autoDownload: true,
        autoInstallOnAppQuit: true,
        on() {},
        removeAllListeners() {},
        downloadUpdate() {
            calls.downloadUpdate += 1;
        },
        quitAndInstall() {
            calls.quitAndInstall += 1;
        }
    };

    return { updater, calls };
}

test('download update is blocked in development mode', async () => {
    const { updater, calls } = createUpdaterDouble();
    const manager = new UpdateManager({
        configManager: createConfigManager(),
        updaterFactory: () => updater
    });
    manager.initialize();

    await assert.rejects(() => manager.downloadUpdate(), /开发环境/);
    assert.equal(calls.downloadUpdate, 0);
    assert.equal(manager.getStatus().message, '开发环境不支持下载更新');
});

test('install update is blocked in development mode', () => {
    const { updater, calls } = createUpdaterDouble();
    const manager = new UpdateManager({
        configManager: createConfigManager(),
        updaterFactory: () => updater
    });
    manager.initialize();

    assert.throws(() => manager.installUpdate(), /开发环境/);
    assert.equal(calls.quitAndInstall, 0);
    assert.equal(manager.getStatus().message, '开发环境不支持安装更新');
});

test('get update settings tolerates invalid persisted custom proxy', () => {
    const manager = new UpdateManager({
        configManager: createConfigManager({
            updateProxyId: 'gh-proxy-v4',
            customUpdateProxyPrefix: 'http://bad.local'
        })
    });

    const settings = manager.getUpdateSettings();

    assert.equal(settings.updateProxyId, 'gh-proxy-v4');
    assert.equal(settings.sources.some((source) => source.id === 'gh-proxy-v4'), true);
    assert.match(settings.updateSettingsError, /自定义更新代理/);
});
