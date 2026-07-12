export const TAB_INDEX = {
  basic: 0,
  subjects: 1,
  timetable: 2,
  daily: 3,
  divider: 4,
  style: 5,
  source: 6,
};

/**
 * 重命名对象键并保持原值。
 * @param {Object} target 目标对象
 * @param {string} oldKey 原键
 * @param {string} nextKey 新键
 * @param {Function|null} selectCallback 选择回调
 * @returns {void}
 */
export function renameObjectKey(target, oldKey, nextKey, selectCallback) {
  if (!target || !oldKey || !nextKey || oldKey === nextKey || target[nextKey]) return;
  target[nextKey] = target[oldKey];
  delete target[oldKey];
  selectCallback?.(nextKey);
}

/**
 * 将整数文本解析为数字，其余输入保持字符串。
 * @param {string} value 输入文本
 * @returns {number|string} 解析结果
 */
export function parseTypedValue(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && value.trim() !== '' ? numeric : value;
}

/**
 * 解析课程输入，逗号分隔时返回轮换课程数组。
 * @param {string} value 输入文本
 * @returns {string|string[]} 课程项
 */
export function parseClassItem(value) {
  const tokens = value.split(/[,，、]/).map((item) => item.trim());
  if (tokens.every((item) => item === '')) return '';
  return tokens.length > 1 ? tokens : tokens[0] || '';
}

/**
 * 获取一个不冲突的新时间段键。
 * @param {Object} table 当前时间表
 * @returns {string} 新时间段键
 */
export function nextTimeRangeKey(table) {
  let minute = Object.keys(table || {}).length;
  let key = `08:${String(minute).padStart(2, '0')}-08:${String(minute + 1).padStart(2, '0')}`;
  while (table[key]) {
    minute += 1;
    key = `08:${String(minute).padStart(2, '0')}-08:${String(minute + 1).padStart(2, '0')}`;
  }
  return key;
}
