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
 * 重命名对象键并保持原值和条目顺序。
 * @param {Object} target 目标对象
 * @param {string} oldKey 原键
 * @param {string} nextKey 新键
 * @param {Function|null} selectCallback 选择回调
 * @returns {void}
 */
export function renameObjectKey(target, oldKey, nextKey, selectCallback) {
  if (!target || !oldKey || !nextKey || oldKey === nextKey
    || !Object.prototype.hasOwnProperty.call(target, oldKey)
    || Object.prototype.hasOwnProperty.call(target, nextKey)) return;
  const entries = Object.entries(target);
  entries.forEach(([key]) => { delete target[key]; });
  entries.forEach(([key, value]) => {
    target[key === oldKey ? nextKey : key] = value;
  });
  selectCallback?.(nextKey);
}

/**
 * 找出使用某个科目简称的每日课表位置。
 * @param {Object} config 课表配置草稿
 * @param {string} subjectKey 科目简称
 * @returns {string[]} 可读引用位置
 */
export function findSubjectReferences(config, subjectKey) {
  const references = [];
  (config.daily_class || []).forEach((day, dayIndex) => {
    (day.classList || []).forEach((item, itemIndex) => {
      const values = Array.isArray(item) ? item : [item];
      if (values.includes(subjectKey)) {
        references.push(`第 ${dayIndex + 1} 天第 ${itemIndex + 1} 节课`);
      }
    });
  });
  return references;
}

/**
 * 找出使用某个时间表类型的每日课表位置。
 * @param {Object} config 课表配置草稿
 * @param {string} type 时间表类型
 * @returns {string[]} 可读引用位置
 */
export function findTimetableReferences(config, type) {
  return (config.daily_class || [])
    .map((day, index) => day.timetable === type ? `第 ${index + 1} 天` : '')
    .filter(Boolean);
}

/**
 * 原子重命名时间表类型、对应分隔线和每日课表引用。
 * @param {Object} config 课表配置草稿
 * @param {string} oldType 原类型
 * @param {string} nextType 新类型
 * @returns {boolean} 是否完成迁移
 */
export function renameScheduleTypeReferences(config, oldType, nextType) {
  if (!config || !oldType || !nextType || oldType === nextType) return false;
  if (config.timetable?.[nextType] || config.divider?.[nextType]) return false;

  if (Object.prototype.hasOwnProperty.call(config.timetable || {}, oldType)) {
    config.timetable[nextType] = config.timetable[oldType];
    delete config.timetable[oldType];
  }
  if (Object.prototype.hasOwnProperty.call(config.divider || {}, oldType)) {
    config.divider[nextType] = config.divider[oldType];
    delete config.divider[oldType];
  }
  (config.daily_class || []).forEach((day) => {
    if (day.timetable === oldType) day.timetable = nextType;
  });
  return true;
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
