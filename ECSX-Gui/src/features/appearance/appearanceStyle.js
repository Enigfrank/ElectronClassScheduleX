import specification from '../../../../src/shared/miniCountdownGlassStyle.json';

export const { defaults, limits } = specification;
export const numericFields = [
  { key: 'blurSigma', label: '模糊强度', ariaLabel: '液态玻璃模糊强度', scale: 1 },
  { key: 'opacity', label: '不透明度', ariaLabel: '液态玻璃不透明度', scale: 100 },
];

/** 将已确认样式转换为可保留空值、小数点等未完成内容的表单草稿。 */
export function toDraft(style) {
  return {
    backgroundColor: style.backgroundColor,
    blurSigma: String(style.blurSigma),
    opacity: String(Math.round(style.opacity * 100)),
  };
}

/** 校验主进程返回的完整样式，拒绝缺失或越界的数据。 */
export function readStyle(result) {
  const style = result?.style;
  if (result?.success !== true || !style || typeof style.backgroundColor !== 'string'
    || !/^#[0-9a-f]{6}$/i.test(style.backgroundColor)
    || Object.keys(limits).some(key => !Number.isFinite(style[key])
      || style[key] < limits[key].min || style[key] > limits[key].max)) {
    throw new Error(typeof result?.error === 'string' ? result.error : '返回的液态玻璃样式无效');
  }
  return { backgroundColor: style.backgroundColor.toLowerCase(), blurSigma: style.blurSigma, opacity: style.opacity };
}

/** 在提交边界校验输入范围和步长，不在输入过程中截断或转换草稿。 */
export function parseField(key, text) {
  const input = text.trim();
  if (key === 'backgroundColor') {
    return /^#[0-9a-f]{6}$/i.test(input)
      ? { value: input.toLowerCase() }
      : { error: '请输入完整的六位十六进制颜色，例如 #202020' };
  }
  const scale = key === 'opacity' ? 100 : 1;
  const { min, max, step } = limits[key];
  const value = Number(input) / scale;
  const steps = (value - min) / step;
  if (!input || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input)
    || !Number.isFinite(value) || value < min || value > max
    || Math.abs(steps - Math.round(steps)) > 1e-7) {
    return { error: `请输入 ${min * scale} 到 ${max * scale} 之间的数值，步长为 ${step * scale}` };
  }
  return { value: Number(value.toFixed(2)) };
}

/** 比较实际样式，避免未修改输入和重复结束事件产生 IPC。 */
export function sameStyle(first, second) {
  return Object.keys(defaults).every(key => first[key] === second[key]);
}
