const MAX_GLASS_TRANSITION_MS = 400;

/** 校验临时原生显隐参数，避免非法时长进入原生动画接口。 */
function isValidGlassPresentation(value) {
    return value === undefined || (value !== null && typeof value === 'object' &&
        typeof value.visible === 'boolean' && Number.isInteger(value.durationMs) &&
        value.durationMs >= 0 && value.durationMs <= MAX_GLASS_TRANSITION_MS);
}

module.exports = { isValidGlassPresentation };
