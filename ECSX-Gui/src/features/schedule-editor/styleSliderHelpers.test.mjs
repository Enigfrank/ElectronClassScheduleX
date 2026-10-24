import test from 'node:test';
import assert from 'node:assert/strict';
import { commitStyleSliderValue, getStyleSliders } from './styleSliderHelpers.mjs';

test('全部已知数值样式提供指定范围和步长', () => {
  const fields = [
    ['--center-font-size', '35px', 100, 1],
    ['--corner-font-size', '0px', 100, 1],
    ['--countdown-font-size', '20px', 100, 1],
    ['--sub-font-size', '15px', 100, 1],
    ['--global-border-radius', '20px', 64, 1],
    ['--global-bg-opacity', '0.72', 1, 0.01],
    ['--container-bg-padding', '8px 14px', 64, 1],
    ['--countdown-bg-padding', '8px 12px', 64, 1],
    ['--container-space', '12px', 64, 1],
    ['--top-space', '4px', 64, 1],
    ['--main-horizontal-space', '6px', 64, 1],
    ['--divider-width', '2px', 16, 1],
    ['--divider-margin', '4px', 64, 1],
  ];
  for (const [key, value, max, step] of fields) {
    const sliders = getStyleSliders(key, value);
    assert.equal(sliders.length, key.endsWith('padding') ? 2 : 1, key);
    for (const slider of sliders) {
      assert.equal(slider.min, 0, key);
      assert.equal(slider.max, max, key);
      assert.equal(slider.step, step, key);
    }
  }
});

test('超出默认端点的既有值扩大滑块范围并原样保留', () => {
  for (const [key, value, expectedValue, min, max] of [
    ['--center-font-size', '145.5px', 145.5, 0, 146],
    ['--top-space', '-12.5px', -12.5, -13, 64],
    ['--divider-width', '24px', 24, 0, 24],
    ['--global-bg-opacity', '1.25', 1.25, 0, 2],
    ['--global-bg-opacity', '-0.2', -0.2, -1, 1],
  ]) {
    const [slider] = getStyleSliders(key, value);
    assert.equal(slider.value, expectedValue);
    assert.equal(slider.min, min);
    assert.equal(slider.max, max);
    assert.equal(commitStyleSliderValue(key, value, 0, slider.value), value);
  }
  assert.deepEqual(getStyleSliders('--container-bg-padding', '80px 120px').map(({ max }) => max), [80, 120]);
});

test('双值 padding 分别更新纵向或横向并保留另一轴文本', () => {
  const key = '--container-bg-padding';
  const value = '08.50px 014px';
  assert.deepEqual(getStyleSliders(key, value).map(({ label, value }) => [label, value]), [['纵向', 8.5], ['横向', 14]]);
  assert.equal(commitStyleSliderValue(key, value, 0, 16), '16px 014px');
  assert.equal(commitStyleSliderValue(key, value, 1, 24), '08.50px 24px');
  assert.equal(commitStyleSliderValue(key, value, 1, 0), '08.50px 0px');
});

test('单值 padding 映射两个轴，仅在修改后展开双值', () => {
  const key = '--countdown-bg-padding';
  assert.deepEqual(getStyleSliders(key, '8px').map(({ value }) => value), [8, 8]);
  assert.equal(commitStyleSliderValue(key, '8px', 0, 12), '12px 8px');
  assert.equal(commitStyleSliderValue(key, '8px', 1, 20), '8px 20px');
  assert.equal(commitStyleSliderValue(key, '  08px  ', 1, 8), '  08px  ');
});

test('识别完整十进制标量并保留 px 单位与无单位透明度', () => {
  assert.equal(getStyleSliders('--center-font-size', ' +35.5PX ')[0].value, 35.5);
  assert.equal(getStyleSliders('--global-bg-opacity', '.72')[0].value, 0.72);
  assert.equal(commitStyleSliderValue('--center-font-size', '35px', 0, 0), '0px');
  assert.equal(commitStyleSliderValue('--global-bg-opacity', '0.72', 0, 0), '0');
  assert.equal(commitStyleSliderValue('--global-bg-opacity', '0.72', 0, 0.73), '0.73');
  assert.equal(commitStyleSliderValue('--global-bg-opacity', '0.72', 0, 1), '1');
});

test('未知字段、自定义单位及不完整输入没有滑块且不会被改写', () => {
  const cases = [
    ['--custom-size', '12px'],
    ['__proto__', '12px'],
    ['--center-font-size', '2rem'],
    ['--center-font-size', '2em'],
    ['--center-font-size', '120%'],
    ['--center-font-size', 'var(--size)'],
    ['--center-font-size', 'calc(12px + 2px)'],
    ['--center-font-size', '12'],
    ['--center-font-size', '12p'],
    ['--center-font-size', '12px garbage'],
    ['--center-font-size', ''],
    ['--center-font-size', '-'],
    ['--center-font-size', '1.'],
    ['--center-font-size', 'Infinitypx'],
    ['--center-font-size', `${'9'.repeat(400)}px`],
    ['--global-bg-opacity', '72%'],
    ['--global-bg-opacity', '0.72px'],
    ['--container-bg-padding', '1px 2px 3px'],
    ['--container-bg-padding', '1px 2px 3px 4px'],
    ['--container-bg-padding', '8px 1rem'],
    ['--container-bg-padding', '8px var(--gap)'],
    ['--container-bg-padding', '8px calc(12px + 2px)'],
    ['--container-bg-padding', '8px 14p'],
  ];
  for (const [key, value] of cases) {
    assert.deepEqual(getStyleSliders(key, value), [], `${key}: ${value}`);
    assert.equal(commitStyleSliderValue(key, value, 0, 20), value);
  }
});

test('无效提交不改变原始 CSS 输入', () => {
  for (const nextValue of [NaN, Infinity, -Infinity, '20', null, undefined]) {
    assert.equal(commitStyleSliderValue('--center-font-size', '35px', 0, nextValue), '35px');
  }
  for (const index of [-1, 0.5, 1, 2, NaN, '0']) {
    assert.equal(commitStyleSliderValue('--center-font-size', '35px', index, 20), '35px');
  }
  assert.equal(commitStyleSliderValue('--container-bg-padding', '8px 14px', 2, 20), '8px 14px');
});
