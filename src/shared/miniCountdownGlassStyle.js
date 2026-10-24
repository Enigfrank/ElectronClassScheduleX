const { defaults, limits } = require('./miniCountdownGlassStyle.json');

/** 检查单个样式字段，不转换字符串或截断越界数值。 */
function isValidField(key, value) {
    if (key === 'backgroundColor') {
        return typeof value === 'string' && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);
    }
    return Number.isFinite(value) && value >= limits[key].min && value <= limits[key].max;
}

/** 为旧配置和损坏的持久化字段提供默认值，返回独立的规范化对象。 */
function normalizeMiniCountdownGlassStyle(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const style = {};
    for (const key of Object.keys(defaults)) {
        style[key] = isValidField(key, source[key]) ? source[key] : defaults[key];
    }
    style.backgroundColor = style.backgroundColor.toLowerCase();
    return style;
}

/** 严格校验完整 IPC 样式；缺字段或无效值不能回退成保存成功。 */
function validateMiniCountdownGlassStyle(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { success: false, error: '迷你倒计时玻璃样式必须是完整对象' };
    }
    for (const key of Object.keys(defaults)) {
        if (!Object.hasOwn(value, key) || !isValidField(key, value[key])) {
            return { success: false, error: `迷你倒计时玻璃样式字段无效: ${key}` };
        }
    }
    return { success: true, style: normalizeMiniCountdownGlassStyle(value) };
}

module.exports = { normalizeMiniCountdownGlassStyle, validateMiniCountdownGlassStyle };
