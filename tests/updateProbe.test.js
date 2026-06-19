const test = require('node:test');
const assert = require('node:assert/strict');

const { probeUpdateSource } = require('../src/modules/update/updateProbe');

test('returns available probe result when requester resolves', async () => {
    const result = await probeUpdateSource(
        { id: 'github', name: 'GitHub 官方源', prefix: '' },
        {
            now: (() => {
                const values = [100, 160, 180];
                return () => values.shift();
            })(),
            request: async () => ({ statusCode: 200, firstByteMs: 60 })
        }
    );

    assert.equal(result.id, 'github');
    assert.equal(result.available, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.firstByteMs, 60);
    assert.equal(result.totalMs, 80);
});

test('returns unavailable probe result when requester rejects', async () => {
    const result = await probeUpdateSource(
        { id: 'gh-proxy-v4', name: 'v4.gh-proxy.org（推荐）', prefix: 'https://v4.gh-proxy.org/' },
        {
            now: (() => {
                const values = [10, 90];
                return () => values.shift();
            })(),
            request: async () => {
                throw new Error('timeout');
            }
        }
    );

    assert.equal(result.id, 'gh-proxy-v4');
    assert.equal(result.available, false);
    assert.equal(result.totalMs, 80);
    assert.match(result.error, /timeout/);
});
