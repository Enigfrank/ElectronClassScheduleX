const DEFAULT_GLASS_PERFORMANCE = {
    tier: 'balanced',
    transitionFrameIntervalMs: 33,
    blurSigmaMultiplier: 0.75
};

const PERFORMANCE_LIMITS = {
    fast: { transitionFrameIntervalMs: 16, blurSigmaMultiplier: 1 },
    balanced: { transitionFrameIntervalMs: 33, blurSigmaMultiplier: 0.75 },
    slow: { transitionFrameIntervalMs: 50, blurSigmaMultiplier: 0.5 }
};

/** 规范化设备性能配置，避免损坏的持久化数据影响状态切换。 */
function normalizeGlassPerformance(value) {
    const tier = Object.hasOwn(PERFORMANCE_LIMITS, value?.tier) ? value.tier : DEFAULT_GLASS_PERFORMANCE.tier;
    const limits = PERFORMANCE_LIMITS[tier];
    const interval = Number.isFinite(value?.transitionFrameIntervalMs)
        ? Math.min(100, Math.max(16, Math.round(value.transitionFrameIntervalMs)))
        : limits.transitionFrameIntervalMs;
    const multiplier = Number.isFinite(value?.blurSigmaMultiplier)
        ? Math.min(1, Math.max(0.25, value.blurSigmaMultiplier))
        : limits.blurSigmaMultiplier;
    return { tier, transitionFrameIntervalMs: interval, blurSigmaMultiplier: multiplier };
}

/** 根据 renderer 测得的平均帧率和长帧比例选择玻璃更新档位。 */
function recommendGlassPerformance({ fps, longFrameRatio = 0 } = {}) {
    if (!Number.isFinite(fps)) return normalizeGlassPerformance();
    if (fps >= 55 && longFrameRatio < 0.08) return normalizeGlassPerformance({ tier: 'fast' });
    if (fps >= 35 && longFrameRatio < 0.2) return normalizeGlassPerformance({ tier: 'balanced' });
    return normalizeGlassPerformance({ tier: 'slow' });
}

module.exports = { DEFAULT_GLASS_PERFORMANCE, normalizeGlassPerformance, recommendGlassPerformance };
