const test = require('node:test');
const assert = require('node:assert/strict');

const {
    LATEST_YML_URL,
    normalizeProxyPrefix,
    getUpdateSources,
    resolveUpdateSource,
    buildLatestYmlUrl,
    buildGenericProviderUrl
} = require('../src/modules/update/updateSources');

test('normalizes valid https proxy prefixes', () => {
    assert.equal(normalizeProxyPrefix('https://example.com'), 'https://example.com/');
    assert.equal(normalizeProxyPrefix(' https://example.com/base/ '), 'https://example.com/base/');
});

test('rejects non-https and local proxy values', () => {
    assert.throws(() => normalizeProxyPrefix('http://127.0.0.1:7890'), /https/);
    assert.throws(() => normalizeProxyPrefix('socks5://127.0.0.1:7890'), /https/);
    assert.throws(() => normalizeProxyPrefix('javascript:alert(1)'), /https/);
});

test('rejects proxy prefixes with query or fragment templates', () => {
    assert.throws(() => normalizeProxyPrefix('https://proxy.example.com/?url='), /查询|片段/);
    assert.throws(() => normalizeProxyPrefix('https://proxy.example.com/#x'), /查询|片段/);
});

test('returns built-in update sources with v4 proxy recommended', () => {
    const sources = getUpdateSources();
    assert.equal(sources[0].id, 'github');
    assert.equal(sources.find((item) => item.id === 'gh-proxy-v4').isRecommended, true);
    assert.equal(sources.find((item) => item.id === 'gh-proxy-v4').prefix, 'https://v4.gh-proxy.org/');
});

test('adds custom source when custom prefix is valid', () => {
    const sources = getUpdateSources('https://updates.example.com');
    const custom = sources.find((item) => item.id === 'custom');
    assert.equal(custom.prefix, 'https://updates.example.com/');
    assert.equal(custom.isProxy, true);
});

test('resolves source from update settings', () => {
    assert.equal(resolveUpdateSource({ useUpdateProxy: false }).id, 'github');
    assert.equal(resolveUpdateSource({ useUpdateProxy: true, updateProxyId: 'gh-proxy-v6' }).id, 'gh-proxy-v6');
    assert.equal(resolveUpdateSource({
        useUpdateProxy: true,
        updateProxyId: 'custom',
        customUpdateProxyPrefix: 'https://custom.example.com/'
    }).prefix, 'https://custom.example.com/');
});

test('ignores invalid custom proxy when a built-in proxy is selected', () => {
    assert.equal(
        resolveUpdateSource({
            useUpdateProxy: true,
            updateProxyId: 'gh-proxy-v4',
            customUpdateProxyPrefix: 'http://bad.local'
        }).id,
        'gh-proxy-v4'
    );
});

test('builds latest.yml URL with URL-prefix proxy', () => {
    const source = resolveUpdateSource({ useUpdateProxy: true, updateProxyId: 'gh-proxy-v4' });
    assert.equal(buildLatestYmlUrl(source), `https://v4.gh-proxy.org/${LATEST_YML_URL}`);
});

test('builds generic provider URL for latest download directory', () => {
    const source = resolveUpdateSource({ useUpdateProxy: true, updateProxyId: 'gh-proxy-v4' });
    assert.equal(
        buildGenericProviderUrl(source),
        'https://v4.gh-proxy.org/https://github.com/Enigfrank/ElectronClassScheduleX/releases/latest/download'
    );
});
