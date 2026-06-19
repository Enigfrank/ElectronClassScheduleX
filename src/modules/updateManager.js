const { app } = require('electron');
const { NsisUpdater } = require('electron-updater');
const {
    getUpdateSources,
    resolveUpdateSource,
    buildGenericProviderUrl,
    normalizeProxyPrefix
} = require('./update/updateSources');
const { probeUpdateSource } = require('./update/updateProbe');
const {
    createUpdateStatus,
    formatDownloadProgress
} = require('./update/updateStatus');

/**
 * 在线更新管理器，负责检查、下载、安装更新及代理测速。
 */
class UpdateManager {
    /**
     * 构造在线更新管理器。
     * @param {Object} options 初始化选项
     */
    constructor(options = {}) {
        this.configManager = options.configManager;
        this.logger = options.logger;
        this.windowManager = options.windowManager;
        this.updaterFactory = options.updaterFactory || ((source) => new NsisUpdater({
            provider: 'generic',
            url: buildGenericProviderUrl(source)
        }));
        this.probeSource = options.probeSource || probeUpdateSource;
        this.status = createUpdateStatus({ currentVersion: app.getVersion() });
        this.currentSource = null;
        this.updater = null;
        this.initialized = false;
        this.autoCheckTimer = null;
    }

    /**
     * 记录更新模块日志。
     * @param {string} level 日志级别
     * @param {string} message 日志内容
     */
    log(level, message) {
        this.logger?.[level]?.(`[在线更新] ${message}`);
    }

    /**
     * 初始化更新器事件。
     */
    initialize() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.prepareUpdater();
    }

    /**
     * 根据当前配置创建 electron-updater 实例。
     * @param {Object|null} settings 更新设置覆盖项
     */
    prepareUpdater(settings = null) {
        const resolvedSettings = settings || this.getUpdateSettings();
        const source = resolveUpdateSource(resolvedSettings);

        if (this.updater) {
            this.updater.removeAllListeners();
        }

        this.currentSource = source;
        this.updater = this.updaterFactory(source);
        this.updater.autoDownload = false;
        this.updater.autoInstallOnAppQuit = false;
        this.bindUpdaterEvents(this.updater, source);
        this.status = createUpdateStatus({
            ...this.status,
            currentVersion: app.getVersion(),
            sourceId: source.id
        });
    }

    /**
     * 绑定 electron-updater 事件并同步 GUI 状态。
     * @param {Object} updater electron-updater 实例
     * @param {Object} source 当前更新源
     */
    bindUpdaterEvents(updater, source) {
        updater.on('checking-for-update', () => {
            this.broadcastStatus(createUpdateStatus({
                currentVersion: app.getVersion(),
                sourceId: source.id,
                state: 'checking',
                message: '正在检查更新'
            }));
        });

        updater.on('update-available', (info) => {
            this.broadcastStatus(createUpdateStatus({
                currentVersion: app.getVersion(),
                latestVersion: info?.version || '',
                sourceId: source.id,
                state: 'available',
                message: `发现新版本 ${info?.version || ''}`
            }));
        });

        updater.on('update-not-available', () => {
            this.broadcastStatus(createUpdateStatus({
                currentVersion: app.getVersion(),
                sourceId: source.id,
                state: 'not-available',
                message: '当前已是最新版本'
            }));
        });

        updater.on('download-progress', (progress) => {
            this.broadcastStatus(createUpdateStatus({
                ...this.status,
                state: 'downloading',
                message: '正在下载更新',
                progress: formatDownloadProgress(progress)
            }));
        });

        updater.on('update-downloaded', (info) => {
            this.broadcastStatus(createUpdateStatus({
                ...this.status,
                latestVersion: info?.version || this.status.latestVersion,
                state: 'downloaded',
                message: '更新已下载，重启后安装'
            }));
        });

        updater.on('error', (error) => {
            this.handleError(error, source);
        });
    }

    /**
     * 获取更新设置及可选源列表。
     * @returns {Object} 更新设置
     */
    getUpdateSettings() {
        const settings = this.configManager.getUpdateSettings();
        let sources;
        let updateSettingsError = '';

        try {
            sources = getUpdateSources(settings.customUpdateProxyPrefix);
        } catch (error) {
            updateSettingsError = error instanceof Error ? error.message : String(error);
            this.log('warn', `忽略无效的自定义更新代理配置: ${updateSettingsError}`);
            sources = getUpdateSources();
        }

        return {
            ...settings,
            sources,
            updateSettingsError
        };
    }

    /**
     * 保存更新设置并重建更新器。
     * @param {Object} settings 用户设置
     * @returns {Object} 保存后的设置
     */
    setUpdateSettings(settings = {}) {
        const nextSettings = { ...settings };

        if (Object.prototype.hasOwnProperty.call(nextSettings, 'customUpdateProxyPrefix') && nextSettings.customUpdateProxyPrefix) {
            nextSettings.customUpdateProxyPrefix = normalizeProxyPrefix(nextSettings.customUpdateProxyPrefix);
        }

        const saved = this.configManager.setUpdateSettings(nextSettings);
        this.prepareUpdater();
        return {
            ...saved,
            sources: getUpdateSources(saved.customUpdateProxyPrefix)
        };
    }

    /**
     * 启动后延迟执行自动检查。
     */
    startAutoCheck() {
        if (!this.configManager.get('autoCheckUpdates')) {
            return;
        }

        if (!app.isPackaged) {
            this.log('info', '开发环境跳过更新检查');
            this.broadcastStatus(createUpdateStatus({
                currentVersion: app.getVersion(),
                sourceId: this.currentSource?.id || '',
                state: 'idle',
                message: '开发环境跳过更新检查'
            }));
            return;
        }

        if (this.autoCheckTimer) {
            clearTimeout(this.autoCheckTimer);
        }

        this.autoCheckTimer = setTimeout(() => {
            this.checkForUpdates({ isManual: false }).catch((error) => this.handleError(error, this.currentSource));
        }, 5000);
        this.autoCheckTimer.unref?.();
    }

    /**
     * 检查更新。
     * @param {Object} options 检查选项
     * @returns {Promise<Object>} 更新结果
     */
    async checkForUpdates(options = {}) {
        if (!app.isPackaged) {
            this.log('info', '开发环境跳过更新检查');
            const status = createUpdateStatus({
                currentVersion: app.getVersion(),
                sourceId: this.currentSource?.id || '',
                state: 'idle',
                message: '开发环境跳过更新检查'
            });
            this.broadcastStatus(status);
            return status;
        }

        try {
            this.prepareUpdater();
            return await this.updater.checkForUpdates();
        } catch (error) {
            if (this.shouldRetryWithOfficialSource()) {
                return this.retryCheckWithOfficialSource(error, options);
            }

            return this.finalizeCheckFailure(error, options);
        }
    }

    /**
     * 判断当前检查失败后是否需要回退到 GitHub 官方源。
     * @returns {boolean} 是否应执行官方源重试
     */
    shouldRetryWithOfficialSource() {
        return Boolean(this.configManager.get('useUpdateProxy'));
    }

    /**
     * 使用 GitHub 官方源在当前检查调用内重试，不改写持久化配置。
     * @param {Error} proxyError 代理源失败错误
     * @param {Object} options 检查选项
     * @returns {Promise<Object>} 更新结果
     */
    async retryCheckWithOfficialSource(proxyError, options = {}) {
        this.log('warn', `代理源检查失败，尝试 GitHub 官方源: ${proxyError.message}`);

        const fallbackSettings = {
            ...this.configManager.getUpdateSettings(),
            useUpdateProxy: false
        };

        try {
            this.prepareUpdater(fallbackSettings);
            return await this.updater.checkForUpdates();
        } catch (fallbackError) {
            return this.finalizeCheckFailure(fallbackError, options);
        }
    }

    /**
     * 处理检查更新最终失败逻辑，并根据触发方式决定是否继续抛错。
     * @param {Error} error 最终错误对象
     * @param {Object} options 检查选项
     * @returns {Object} 当前更新状态
     */
    finalizeCheckFailure(error, options = {}) {
        this.handleError(error, this.currentSource);
        if (options.isManual) {
            throw error;
        }
        return this.status;
    }

    /**
     * 下载已发现的更新。
     * @returns {Promise<void>} 下载结果
     */
    async downloadUpdate() {
        if (!app.isPackaged) {
            const error = new Error('开发环境不支持下载更新');
            this.broadcastStatus(createUpdateStatus({
                ...this.status,
                state: 'error',
                message: '开发环境不支持下载更新',
                error: error.message
            }));
            throw error;
        }

        if (!this.updater) {
            this.prepareUpdater();
        }
        return this.updater.downloadUpdate();
    }

    /**
     * 退出并安装已下载的更新。
     */
    installUpdate() {
        if (!app.isPackaged) {
            const error = new Error('开发环境不支持安装更新');
            this.broadcastStatus(createUpdateStatus({
                ...this.status,
                state: 'error',
                message: '开发环境不支持安装更新',
                error: error.message
            }));
            throw error;
        }

        this.updater?.quitAndInstall(false, true);
    }

    /**
     * 测试所有可用更新源的访问延迟。
     * @returns {Promise<Array<Object>>} 测速结果
     */
    async testUpdateSources() {
        const settings = this.configManager.getUpdateSettings();
        const sources = getUpdateSources(settings.customUpdateProxyPrefix);
        const results = await Promise.all(sources.map((source) => this.probeSource(source)));

        return results.sort((a, b) => {
            if (a.available !== b.available) {
                return a.available ? -1 : 1;
            }
            return a.totalMs - b.totalMs;
        });
    }

    /**
     * 获取当前更新状态。
     * @returns {Object} 更新状态
     */
    getStatus() {
        return this.status;
    }

    /**
     * 广播更新状态到 GUI 窗口。
     * @param {Object} status 更新状态
     */
    broadcastStatus(status) {
        this.status = status;
        const guiWindow = this.windowManager?.getWindow?.('gui');
        if (guiWindow && !guiWindow.isDestroyed()) {
            guiWindow.webContents.send('update-status-changed', status);
        }
    }

    /**
     * 处理更新错误并同步状态。
     * @param {Error} error 错误对象
     * @param {Object} source 当前更新源
     */
    handleError(error, source) {
        const message = error instanceof Error ? error.message : String(error);
        this.log('error', `${source?.id || 'unknown'} 更新失败: ${message}`);
        this.broadcastStatus(createUpdateStatus({
            currentVersion: app.getVersion(),
            sourceId: source?.id || '',
            state: 'error',
            message: '更新失败',
            error: message
        }));
    }
}

module.exports = UpdateManager;
