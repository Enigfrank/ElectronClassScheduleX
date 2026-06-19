const UPDATE_REPOSITORY = Object.freeze({
    owner: 'Enigfrank',
    repo: 'ElectronClassScheduleX'
});

const GITHUB_RELEASE_LATEST_DOWNLOAD_URL = `https://github.com/${UPDATE_REPOSITORY.owner}/${UPDATE_REPOSITORY.repo}/releases/latest/download`;
const LATEST_YML_URL = `${GITHUB_RELEASE_LATEST_DOWNLOAD_URL}/latest.yml`;

const UPDATE_SOURCES = Object.freeze([
    { id: 'github', name: 'GitHub 官方源', prefix: '', isProxy: false },
    { id: 'gh-proxy-v4', name: 'v4.gh-proxy.org（推荐）', prefix: 'https://v4.gh-proxy.org/', isProxy: true, isRecommended: true },
    { id: 'gh-proxy', name: 'gh-proxy.org', prefix: 'https://gh-proxy.org/', isProxy: true },
    { id: 'gh-proxy-v6', name: 'v6.gh-proxy.org', prefix: 'https://v6.gh-proxy.org/', isProxy: true },
    { id: 'gh-proxy-cdn', name: 'cdn.gh-proxy.org', prefix: 'https://cdn.gh-proxy.org/', isProxy: true }
]);

/**
 * 标准化自定义代理前缀，并拒绝非 HTTPS 或本机代理地址。
 * @param {string} value 自定义代理前缀
 * @returns {string} 末尾带斜杠的 HTTPS 前缀
 */
function normalizeProxyPrefix(value) {
    const prefix = String(value || '').trim();

    if (!prefix.startsWith('https://')) {
        throw new Error('自定义更新代理必须以 https:// 开头');
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(prefix);
    } catch {
        throw new Error('自定义更新代理必须是有效的 https URL');
    }

    if (parsedUrl.search || parsedUrl.hash) {
        throw new Error('自定义更新代理不允许包含查询或片段');
    }

    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1' || parsedUrl.hostname === '::1') {
        throw new Error('自定义更新代理不支持本机系统代理地址');
    }

    return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

/**
 * 获取可展示给界面的更新源列表。
 * @param {string} customPrefix 自定义代理前缀
 * @returns {Array<object>} 更新源列表
 */
function getUpdateSources(customPrefix = '') {
    const sources = UPDATE_SOURCES.map((source) => ({ ...source }));

    if (customPrefix) {
        sources.push({
            id: 'custom',
            name: '自定义代理',
            prefix: normalizeProxyPrefix(customPrefix),
            isProxy: true
        });
    }

    return sources;
}

/**
 * 根据设置解析当前更新源。
 * @param {object} settings 更新设置
 * @returns {object} 当前更新源
 */
function resolveUpdateSource(settings = {}) {
    if (!settings.useUpdateProxy) {
        return { ...UPDATE_SOURCES[0] };
    }

    const sources = UPDATE_SOURCES.map((source) => ({ ...source }));

    if (settings.updateProxyId === 'custom') {
        sources.push({
            id: 'custom',
            name: '自定义代理',
            prefix: normalizeProxyPrefix(settings.customUpdateProxyPrefix),
            isProxy: true
        });
    }

    return (
        sources.find((source) => source.id === settings.updateProxyId) ||
        sources.find((source) => source.id === 'gh-proxy-v4')
    );
}

/**
 * 构造 latest.yml 的完整请求地址。
 * @param {object} source 更新源
 * @returns {string} latest.yml 地址
 */
function buildLatestYmlUrl(source) {
    return `${source.prefix || ''}${LATEST_YML_URL}`;
}

/**
 * 构造 electron-updater generic provider 的基础 URL。
 * @param {object} source 更新源
 * @returns {string} generic provider 地址
 */
function buildGenericProviderUrl(source) {
    return `${source.prefix || ''}${GITHUB_RELEASE_LATEST_DOWNLOAD_URL}`;
}

module.exports = {
    UPDATE_REPOSITORY,
    LATEST_YML_URL,
    UPDATE_SOURCES,
    normalizeProxyPrefix,
    getUpdateSources,
    resolveUpdateSource,
    buildLatestYmlUrl,
    buildGenericProviderUrl
};
