const STYLE_SLIDER_FIELDS = {
  '--center-font-size': { max: 100 },
  '--corner-font-size': { max: 100 },
  '--countdown-font-size': { max: 100 },
  '--sub-font-size': { max: 100 },
  '--global-border-radius': { max: 64 },
  '--global-bg-opacity': { max: 1, unit: '', step: 0.01 },
  '--container-bg-padding': { max: 64, padding: true },
  '--countdown-bg-padding': { max: 64, padding: true },
  '--container-space': { max: 64 },
  '--top-space': { max: 64 },
  '--main-horizontal-space': { max: 64 },
  '--divider-width': { max: 16 },
  '--divider-margin': { max: 64 },
};

/**
 * 仅识别已知字段的完整 CSS 标量，保留无法表达为滑块的原始文本。
 * @param {string} key CSS 变量名
 * @param {string} value CSS 原始值
 * @returns {{field: Object, tokens: string[], values: number[], unit: string}|null} 可编辑数值
 */
function parseStyleSliderValue(key, value) {
  if (!Object.hasOwn(STYLE_SLIDER_FIELDS, key) || typeof value !== 'string') return null;
  const field = STYLE_SLIDER_FIELDS[key];
  const unit = field.unit ?? 'px';
  const tokens = value.trim().split(/\s+/);
  if (tokens.length > (field.padding ? 2 : 1)) return null;
  const scalarPattern = unit === 'px'
    ? /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)px$/i
    : /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
  if (tokens.some((token) => !scalarPattern.test(token))) return null;
  const values = tokens.map((token) => Number(unit ? token.slice(0, -unit.length) : token));
  if (values.some((number) => !Number.isFinite(number))) return null;
  return { field, tokens, values, unit };
}

/**
 * 为可识别样式建立滑块描述，扩大端点以容纳既有配置而不截断数值。
 * @param {string} key CSS 变量名
 * @param {string} value CSS 原始值
 * @returns {{index: number, label: string, value: number, min: number, max: number, step: number}[]} 滑块列表
 */
export function getStyleSliders(key, value) {
  const parsed = parseStyleSliderValue(key, value);
  if (!parsed) return [];
  const { field, values } = parsed;
  const labels = field.padding ? ['纵向', '横向'] : [''];
  return labels.map((label, index) => {
    const number = values[index] ?? values[0];
    return {
      index,
      label,
      value: number,
      min: Math.min(0, Math.floor(number)),
      max: Math.max(field.max, Math.ceil(number)),
      step: field.step ?? 1,
    };
  });
}

/**
 * 将已提交的滑块数值写回目标轴，未知格式及未改变的值保持原样。
 * @param {string} key CSS 变量名
 * @param {string} value CSS 原始值
 * @param {number} index 目标滑块索引，padding 的 0/1 分别表示纵向/横向
 * @param {number} nextValue 已提交数值
 * @returns {string} 更新后的 CSS 文本
 */
export function commitStyleSliderValue(key, value, index, nextValue) {
  const parsed = parseStyleSliderValue(key, value);
  if (!parsed || !Number.isFinite(nextValue)) return value;
  if (!Number.isInteger(index) || index < 0 || index >= (parsed.field.padding ? 2 : 1)) return value;
  if (nextValue === (parsed.values[index] ?? parsed.values[0])) return value;
  const tokens = parsed.field.padding && parsed.tokens.length === 1
    ? [parsed.tokens[0], parsed.tokens[0]]
    : [...parsed.tokens];
  tokens[index] = `${nextValue}${parsed.unit}`;
  return tokens.join(' ');
}
