const ROOT_FIELD_ORDER = [
  'countdown_target',
  'semester_start_date',
  'week_display',
  'subject_name',
  'timetable',
  'divider',
  'daily_class',
  'css_style',
];

const STYLE_FIELD_ORDER = [
  '--center-font-size',
  '--corner-font-size',
  '--countdown-font-size',
  '--global-border-radius',
  '--global-bg-opacity',
  '--container-bg-padding',
  '--countdown-bg-padding',
  '--container-space',
  '--top-space',
  '--main-horizontal-space',
  '--divider-width',
  '--divider-margin',
  '--sub-font-size',
];

const ROOT_FIELD_COMMENTS = {
  countdown_target: [
    '// 倒计时目标：位于右侧框中的倒计时，输入日期即可，可以是中考高考期末等等，格式YYYY-MM-DD',
    "// 若想隐藏右侧的倒计时，请在下方冒号后填入'hidden', (包括引号)",
  ],
  semester_start_date: [
    '// 学期起始日期：用于自动切换单双周，从该日期起每 7 天切换一次，第一周为单周',
    "// 留空时使用仪表盘中的手动单周/双周设置，格式为 'YYYY-MM-DD'",
  ],
  subject_name: [
    '// 科目名称：所有课程科目的简写及其对应全称，冒号前面(key)为简写，后面(value)为全称，不限字数，',
    "// 若存在多个课程简写相同，需要加以区分，可以为简写添加下角标，使用@分隔，如'自@语'，@前为简写，@后为下角标",
    '// 要求必须做到覆盖完全，否则可能会保错',
  ],
  timetable: [
    "// 时间表: 每天课程安排的时间表，内层冒号前面为时间，后面为课程序号(从0开始的数字[不带'']) 或 课间具体名称(用''包裹中间写文字)",
    "// 注：时间段中-后的时间要减一分钟 比如某节课40分钟，时间段为08:00-08:40，但实际配置时要配置'08:00-08:39'",
  ],
  divider: [
    '// 分隔线: 课表中区分不同时段课程的分隔线配置，外层key（冒号前）部分与上面timeable相同',
    "// value（冒号后）为分隔线所在位置的前一个课程序号(从0开始的数字[不带''])",
  ],
  daily_class: [
    '// 从classList后最外的中括号看起，里面的第几个元素的序号-1就是该元素的下标，这个下标对应你在上面timetable中配置的数字，课程用单引号包含，写入在subject_name中配置的简写',
    "// 如果该节课按单双周轮换，可写成 ['物', '化']：第一个为单周课程，第二个为双周课程",
    "// 下面的timetable中配置该日属于在上面的timetable中的哪一类，如周日属于weekend就这样写 timetable: 'weekend'，用单引号包含",
  ],
  css_style: [
    '// 课表样式: 配置课表样式CSS变量, 包括字体大小，透明度等属性',
    '// 请不要更改冒号前半部分文字, 请更改冒号后单引号中的数字(切勿删除引号与数字后的单位)',
    '// 如果你对CSS有所了解你也可以尝试更改CSS单位',
  ],
};

const STYLE_FIELD_COMMENTS = {
  '--center-font-size': '中间课表中的课程简写单字的字体大小',
  '--corner-font-size': '左侧的星期中文角标与右侧的"天"字的字体大小',
  '--countdown-font-size': '课程或课间全称与倒计时的字体大小 (需比--center-font-size少15单位)',
  '--global-border-radius': '所有背景框的圆角大小',
  '--global-bg-opacity': '所有背景框的不透明度, 范围: [0, 1]',
  '--container-bg-padding': '上面三个框各自的背景内边距, 前面的数字表示纵向边距，后面的数字表示横向边距',
  '--countdown-bg-padding': '倒计时框的背景内边距, 前面的数字表示纵向边距，后面的数字表示横向边距',
  '--container-space': '上面三个框中间的间隔长度',
  '--top-space': '课表主体最顶端与电脑屏幕上边框的间隔长度',
  '--main-horizontal-space': '中间课表中的课程简写单字之间的间隔长度',
  '--divider-width': '分隔线宽度',
  '--divider-margin': '分隔线外边距',
  '--sub-font-size': '中间课表中的课程下角标(X@X)的字体大小',
};

const UNKNOWN_STYLE_FIELD_COMMENT = '自定义 CSS 变量，请填写有效的 CSS 值并保留必要单位';

const DEFAULT_CSS_STYLE = {
  '--center-font-size': '35px',
  '--corner-font-size': '0px',
  '--countdown-font-size': '20px',
  '--global-border-radius': '20px',
  '--global-bg-opacity': '0.72',
  '--container-bg-padding': '8px 14px',
  '--countdown-bg-padding': '8px 12px',
  '--container-space': '12px',
  '--top-space': '4px',
  '--main-horizontal-space': '6px',
  '--divider-width': '2px',
  '--divider-margin': '4px',
  '--sub-font-size': '15px',
};

/**
 * 从 JS 源码中提取课表配置对象字面量。
 * @param {string} content JS 配置源码
 * @returns {string} 配置对象字面量文本
 */
function extractConfigLiteral(content) {
  const markers = [
    'const _scheduleConfig',
    'let _scheduleConfig',
    'var _scheduleConfig',
    'const scheduleConfig',
    'let scheduleConfig',
    'var scheduleConfig',
  ];

  const markerIndex = markers.reduce((found, marker) => {
    if (found !== -1) return found;
    return content.indexOf(marker);
  }, -1);

  if (markerIndex === -1) {
    throw new Error('未找到配置对象声明');
  }

  const braceStart = content.indexOf('{', markerIndex);
  if (braceStart === -1) {
    throw new Error('未找到配置对象起始符号');
  }

  return content.slice(braceStart, findMatchingBrace(content, braceStart) + 1);
}

/**
 * 查找与起始花括号匹配的结束位置，忽略字符串和注释内容。
 * @param {string} text 源文本
 * @param {number} startIndex 起始花括号位置
 * @returns {number} 匹配结束花括号位置
 */
function findMatchingBrace(text, startIndex) {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i += 1) {
    const current = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (current === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inSingle || inDouble || inTemplate) {
      if (!escaped && current === '\\') {
        escaped = true;
        continue;
      }
      if (!escaped && ((inSingle && current === '\'') || (inDouble && current === '"') || (inTemplate && current === '`'))) {
        inSingle = false;
        inDouble = false;
        inTemplate = false;
      }
      escaped = false;
      continue;
    }

    if (current === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (current === '\'') {
      inSingle = true;
      continue;
    }
    if (current === '"') {
      inDouble = true;
      continue;
    }
    if (current === '`') {
      inTemplate = true;
      continue;
    }
    if (current === '{') {
      depth += 1;
      continue;
    }
    if (current === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  throw new Error('配置对象括号不匹配');
}

/**
 * 删除对象字面量注释并保留字符串内容。
 * @param {string} literal 对象字面量文本
 * @returns {string} 去注释后的对象字面量
 */
function stripComments(literal) {
  let output = '';
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let i = 0; i < literal.length; i += 1) {
    const current = literal[i];
    const next = literal[i + 1];

    if (inLineComment) {
      if (current === '\n') {
        inLineComment = false;
        output += current;
      }
      continue;
    }
    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (!inSingle && !inDouble && !inTemplate) {
      if (current === '/' && next === '/') {
        inLineComment = true;
        i += 1;
        continue;
      }
      if (current === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
        continue;
      }
    }

    output += current;
    if (!escaped && current === '\\') {
      escaped = true;
      continue;
    }
    if (!escaped && inSingle && current === '\'') inSingle = false;
    else if (!escaped && inDouble && current === '"') inDouble = false;
    else if (!escaped && inTemplate && current === '`') inTemplate = false;
    else if (!inSingle && !inDouble && !inTemplate && current === '\'') inSingle = true;
    else if (!inSingle && !inDouble && !inTemplate && current === '"') inDouble = true;
    else if (!inSingle && !inDouble && !inTemplate && current === '`') inTemplate = true;
    escaped = false;
  }

  return output;
}

/**
 * 解析 JS 课表配置源码为对象。
 * @param {string} content JS 配置源码
 * @returns {Object} 配置对象
 */
export function parseScheduleConfigSource(content) {
  const literal = stripComments(extractConfigLiteral(content))
    .replace(/\u00A0/g, ' ')
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
  const parsed = new Function(`"use strict"; return (${literal});`)();

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('配置对象格式无效');
  }

  return parsed;
}

/**
 * 深拷贝任意 JSON 可序列化值。
 * @param {*} value 待克隆值
 * @returns {*} 深拷贝结果
 */
export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * 创建默认编辑器配置。
 * @returns {Object} 默认课表配置
 */
export function createDefaultConfig() {
  return {
    countdown_target: 'hidden',
    semester_start_date: '',
    week_display: false,
    subject_name: {},
    timetable: {},
    divider: {},
    daily_class: [],
    css_style: { ...DEFAULT_CSS_STYLE },
  };
}

/**
 * 规整课表配置为编辑器可处理的标准结构。
 * @param {Object} rawConfig 输入配置
 * @returns {Object} 标准配置
 */
export function normalizeScheduleConfig(rawConfig) {
  const base = createDefaultConfig();
  const source = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

  base.countdown_target = typeof source.countdown_target === 'string'
    ? source.countdown_target.trim() || 'hidden'
    : 'hidden';
  base.semester_start_date = typeof source.semester_start_date === 'string'
    ? source.semester_start_date.trim()
    : '';
  base.week_display = Boolean(source.week_display);
  base.subject_name = normalizeStringMap(source.subject_name);
  base.timetable = normalizeTimetable(source.timetable);
  base.divider = normalizeDivider(source.divider);
  base.daily_class = normalizeDailyClass(source.daily_class);
  base.css_style = { ...DEFAULT_CSS_STYLE, ...normalizeStyleConfig(source.css_style) };

  return base;
}

/**
 * 规整课表配置为编辑器状态，保留用户正在输入的空项占位。
 * @param {Object} rawConfig 输入配置
 * @returns {Object} 编辑器可处理的配置
 */
export function normalizeScheduleConfigForEditor(rawConfig) {
  return normalizeScheduleConfig(rawConfig);
}

/**
 * 列出导入时会被规范化或丢弃的时间表与分隔线字段。
 * @param {Object} rawConfig 导入前配置
 * @returns {string[]} 用户可读的问题说明
 */
export function getScheduleConfigNormalizationIssues(rawConfig) {
  const issues = [];
  const timetable = rawConfig?.timetable;
  if (timetable && typeof timetable === 'object' && !Array.isArray(timetable)) {
    Object.entries(timetable).forEach(([type, entries]) => {
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
        issues.push(`时间表类型“${type}”不是对象，已忽略`);
        return;
      }
      Object.keys(entries).forEach((range) => {
        if (!normalizeTimeRange(range)) {
          issues.push(`时间段“${type}.${range}”格式无效，已忽略`);
        }
      });
    });
  }

  const divider = rawConfig?.divider;
  if (divider && typeof divider === 'object' && !Array.isArray(divider)) {
    Object.entries(divider).forEach(([type, indexes]) => {
      if (!Array.isArray(indexes)) {
        issues.push(`分隔线“${type}”不是数组，已忽略`);
        return;
      }
      indexes.forEach((value, index) => {
        if (!Number.isInteger(Number(value)) || Number(value) < 0) {
          issues.push(`分隔线“${type}[${index}]”不是非负整数，已忽略`);
        }
      });
    });
  }
  return issues;
}

/**
 * 检测源配置是否包含可选字段。
 * @param {Object} config 配置对象
 * @returns {{hasWeekDisplay: boolean, hasSemesterStartDate: boolean}} 源结构信息
 */
export function detectSourceStructure(config) {
  return {
    hasWeekDisplay: Boolean(config && Object.prototype.hasOwnProperty.call(config, 'week_display')),
    hasSemesterStartDate: Boolean(config && Object.prototype.hasOwnProperty.call(config, 'semester_start_date')),
  };
}

/**
 * 获取样式变量的用户可读说明。
 * @param {string} key CSS 变量名
 * @returns {string} 样式变量说明
 */
export function getStyleFieldComment(key) {
  return STYLE_FIELD_COMMENTS[key] || UNKNOWN_STYLE_FIELD_COMMENT;
}

/**
 * 规整字符串键值对象。
 * @param {*} source 输入对象
 * @returns {Object} 字符串键值对象
 */
export function normalizeStringMap(source) {
  const result = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return result;

  Object.entries(source).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    const normalizedValue = String(value ?? '').trim();
    if (normalizedKey) result[normalizedKey] = normalizedValue;
  });

  return result;
}

/**
 * 规整样式配置并移除已废弃的 CSS 变量。
 * @param {*} source 样式配置对象
 * @returns {Object} 可由工具条使用的样式配置
 */
function normalizeStyleConfig(source) {
  const result = normalizeStringMap(source);
  delete result['--triangle-size'];
  return result;
}

/**
 * 标准化时间段文本。
 * @param {*} rawRange 输入时间段
 * @returns {string} HH:MM-HH:MM 格式时间段
 */
export function normalizeTimeRange(rawRange) {
  const compact = String(rawRange ?? '').replace(/[~～—–至]/g, '-').replace(/\s+/g, '');
  const match = compact.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!match) return '';

  const formatTime = (value) => {
    const [hour, minute] = value.split(':');
    return `${hour.padStart(2, '0')}:${minute}`;
  };

  return `${formatTime(match[1])}-${formatTime(match[2])}`;
}

/**
 * 规整时间表配置。
 * @param {*} timetable 输入时间表
 * @returns {Object} 标准时间表
 */
export function normalizeTimetable(timetable) {
  const result = {};
  if (!timetable || typeof timetable !== 'object' || Array.isArray(timetable)) return result;

  Object.entries(timetable).forEach(([dayType, dayValue]) => {
    const key = String(dayType || '').trim();
    if (!key || !dayValue || typeof dayValue !== 'object' || Array.isArray(dayValue)) return;

    result[key] = {};
    Object.entries(dayValue).forEach(([timeRange, content]) => {
      const normalizedRange = normalizeTimeRange(timeRange);
      if (!normalizedRange) return;

      const numeric = Number(content);
      result[key][normalizedRange] = Number.isInteger(numeric) && String(content).trim() !== '' ? numeric : String(content ?? '').trim();
    });
  });

  return result;
}

/**
 * 规整分隔线配置。
 * @param {*} divider 输入分隔线配置
 * @returns {Object} 标准分隔线配置
 */
export function normalizeDivider(divider) {
  const result = {};
  if (!divider || typeof divider !== 'object' || Array.isArray(divider)) return result;

  Object.entries(divider).forEach(([dayType, indexes]) => {
    const key = String(dayType || '').trim();
    if (!key || !Array.isArray(indexes)) return;
    result[key] = Array.from(new Set(indexes.map(Number).filter((value) => Number.isInteger(value) && value >= 0)))
      .sort((a, b) => a - b);
  });

  return result;
}

/**
 * 规整每日课表配置。
 * @param {*} dailyClass 输入每日课表
 * @returns {Array<Object>} 标准每日课表
 */
export function normalizeDailyClass(dailyClass) {
  if (!Array.isArray(dailyClass)) return [];

  return dailyClass.map((day) => ({
    Chinese: String(day?.Chinese ?? '').trim(),
    English: String(day?.English ?? '').trim(),
    classList: Array.isArray(day?.classList)
      ? day.classList.map((item) => (Array.isArray(item)
        ? item.map((child) => String(child ?? '').trim())
        : String(item ?? '').trim()))
      : [],
    timetable: String(day?.timetable ?? '').trim(),
  }));
}

/**
 * 将字符串包装为单引号 JS 字面量。
 * @param {*} value 待格式化值
 * @returns {string} JS 字符串字面量
 */
export function quoteString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n')}'`;
}

/**
 * 格式化任意配置值为 JS 片段。
 * @param {*} value 配置值
 * @param {number} indentLevel 缩进层级
 * @returns {string} JS 片段
 */
export function formatValue(value, indentLevel = 0) {
  const indent = '    '.repeat(indentLevel);
  const childIndent = '    '.repeat(indentLevel + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const compact = value.length <= 16 && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item) || item === null || (Array.isArray(item) && item.length <= 4));
    if (compact) return `[${value.map((item) => formatValue(item, 0)).join(', ')}]`;
    return `[\n${value.map((item) => `${childIndent}${formatValue(item, indentLevel + 1)}`).join(',\n')}\n${indent}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const lines = entries.map(([key, item]) => {
      const validIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key);
      return `${childIndent}${validIdentifier ? key : quoteString(key)}: ${formatValue(item, indentLevel + 1)}`;
    });
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }

  if (typeof value === 'string') return quoteString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return quoteString(String(value));
}

/**
 * 生成标准 scheduleConfig.js 源码。
 * @param {Object} config 配置对象
 * @param {{hasWeekDisplay?: boolean, hasSemesterStartDate?: boolean}} sourceStructure 源结构信息
 * @returns {string} JS 配置源码
 */
export function generateScheduleConfigSource(config, sourceStructure = {}) {
  const exportConfig = {
    countdown_target: config.countdown_target,
    ...(sourceStructure.hasSemesterStartDate || config.semester_start_date
      ? { semester_start_date: config.semester_start_date || '' }
      : {}),
    ...(sourceStructure.hasWeekDisplay ? { week_display: Boolean(config.week_display) } : {}),
    subject_name: config.subject_name || {},
    timetable: config.timetable || {},
    divider: config.divider || {},
    daily_class: config.daily_class || [],
    css_style: config.css_style || {},
  };
  const lines = ROOT_FIELD_ORDER
    .filter((key) => Object.prototype.hasOwnProperty.call(exportConfig, key))
    .map((key) => {
      const value = key === 'css_style' ? formatStyleObject(exportConfig[key], 1) : formatValue(exportConfig[key], 1);
      const comments = ROOT_FIELD_COMMENTS[key] || [];
      return `${comments.map((comment) => `    ${comment}`).join('\n')}${comments.length ? '\n' : ''}    ${key}: ${value},`;
    });

  return `// 此文件为配置模板\nconst _scheduleConfig = {\n\n${lines.join('\n\n')}\n\n}\n\nvar scheduleConfig = JSON.parse(JSON.stringify(_scheduleConfig))`;
}

/**
 * 按样式字段顺序格式化样式配置。
 * @param {Object} styleConfig 样式配置
 * @param {number} indentLevel 缩进层级
 * @returns {string} 样式对象源码
 */
export function formatStyleObject(styleConfig, indentLevel = 1) {
  const indent = '    '.repeat(indentLevel);
  const childIndent = '    '.repeat(indentLevel + 1);
  const source = styleConfig && typeof styleConfig === 'object' && !Array.isArray(styleConfig) ? styleConfig : {};
  const keys = STYLE_FIELD_ORDER.filter((key) => Object.prototype.hasOwnProperty.call(source, key));
  Object.keys(source).forEach((key) => {
    if (!keys.includes(key)) keys.push(key);
  });

  if (keys.length === 0) return '{}';
  return `{\n${keys.map((key) => {
    const comment = STYLE_FIELD_COMMENTS[key] ? ` // ${STYLE_FIELD_COMMENTS[key]}` : '';
    return `${childIndent}${quoteString(key)}: ${formatValue(source[key], indentLevel + 1)},${comment}`;
  }).join('\n')}\n${indent}}`;
}

/**
 * 清洗类型名称。
 * @param {*} typeName 类型名称
 * @returns {string} 可保存类型名称
 */
export function sanitizeTypeName(typeName) {
  return String(typeName || '').trim().replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fa5-]/g, '');
}

/**
 * 格式化主进程返回的课表配置错误，显示具体字段路径和原因。
 * @param {Object|null} error 错误对象
 * @param {string} fallbackMessage 兜底提示
 * @returns {string} 可直接显示给用户的错误说明
 */
export function formatScheduleConfigError(error, fallbackMessage = '课表配置处理失败') {
  const message = error?.message || fallbackMessage;
  const details = Array.isArray(error?.details) ? error.details : [];
  if (details.length === 0) return message;

  const detailText = details
    .map((item, index) => `${index + 1}. ${item.path ? `${item.path}: ` : ''}${item.message || '未知错误'}`)
    .join('\n');
  return `${fallbackMessage}: ${message}\n${detailText}`;
}
