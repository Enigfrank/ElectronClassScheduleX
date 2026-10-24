const assert = require('node:assert/strict');
const { test } = require('node:test');
const { defaults, limits } = require('../src/shared/miniCountdownGlassStyle.json');
const { normalizeMiniCountdownGlassStyle, validateMiniCountdownGlassStyle } = require('../src/shared/miniCountdownGlassStyle');

test('共享样式契约包含约定默认值和范围', () => {
    assert.deepEqual(defaults, { backgroundColor: '#202020', blurSigma: 1, opacity: 0.3 });
    assert.deepEqual(limits, {
        blurSigma: { min: 0, max: 10, step: 0.1 }, opacity: { min: 0, max: 1, step: 0.01 }
    });
});

test('旧配置和坏字段回退默认值，合法字段保留且颜色转小写', () => {
    for (const value of [undefined, null, [], 'bad', 0, {}, {
        backgroundColor: '#fff', blurSigma: NaN, opacity: Infinity
    }]) assert.deepEqual(normalizeMiniCountdownGlassStyle(value), defaults);
    assert.deepEqual(normalizeMiniCountdownGlassStyle({ backgroundColor: '#ABCDEF', blurSigma: -1, opacity: 0 }),
        { backgroundColor: '#abcdef', blurSigma: 1, opacity: 0 });
    const copy = normalizeMiniCountdownGlassStyle();
    copy.opacity = 1;
    assert.equal(normalizeMiniCountdownGlassStyle().opacity, 0.3);
});

test('IPC 严格拒绝缺失字段、非法颜色、非有限数值、越界和数值字符串', () => {
    for (const value of [undefined, null, [], {}, ...Object.keys(defaults).map(key => {
        const copy = { ...defaults };
        delete copy[key];
        return copy;
    })]) assert.equal(validateMiniCountdownGlassStyle(value).success, false);
    for (const backgroundColor of ['#fff', '#12345678', '123456', '#GG0000', '#abcdef\n', '#abcdef\r', 'red', '', 123456]) {
        assert.equal(validateMiniCountdownGlassStyle({ ...defaults, backgroundColor }).success, false);
    }
    for (const key of ['blurSigma', 'opacity']) {
        for (const invalid of [NaN, Infinity, -Infinity, '1', null, undefined, true, -0.01, limits[key].max + 0.01]) {
            assert.equal(validateMiniCountdownGlassStyle({ ...defaults, [key]: invalid }).success, false);
        }
    }
});

test('IPC 接受边界值、规范化颜色并去掉未知字段', () => {
    for (const edge of ['min', 'max']) {
        const style = { backgroundColor: '#ABCDEF', blurSigma: limits.blurSigma[edge], opacity: limits.opacity[edge] };
        assert.deepEqual(validateMiniCountdownGlassStyle({ ...style, extra: true }), {
            success: true, style: { ...style, backgroundColor: '#abcdef' }
        });
    }
});
