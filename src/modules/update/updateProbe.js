const https = require("https");
const { buildLatestYmlUrl } = require("./updateSources");

/**
 * 发送默认 HTTPS 请求并记录首字节耗时。
 * @param {string} url 目标地址
 * @param {number} timeoutMs 超时时间
 * @returns {Promise<{statusCode: number, firstByteMs: number}>} 请求结果
 */
function defaultRequest(url, timeoutMs) {
    const startedAt = Date.now();

    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: timeoutMs }, (res) => {
            let settled = false;

            const finish = () => {
                if (settled) {
                    return;
                }

                settled = true;
                resolve({
                    statusCode: res.statusCode || 0,
                    firstByteMs: Date.now() - startedAt
                });
            };

            res.once("data", finish);
            res.once("end", finish);
        });

        req.on("timeout", () => {
            req.destroy(new Error("请求超时"));
        });

        req.on("error", reject);
    });
}

/**
 * 探测单个更新源的 latest.yml 可访问性和延迟。
 * @param {object} source 更新源
 * @param {object} options 注入选项
 * @returns {Promise<object>} 探测结果
 */
async function probeUpdateSource(source, options = {}) {
    const timeoutMs = options.timeoutMs || 8000;
    const now = options.now || Date.now;
    const request = options.request || defaultRequest;
    const url = buildLatestYmlUrl(source);
    const startedAt = now();

    try {
        const response = await request(url, timeoutMs);
        const totalMs = now() - startedAt;

        return {
            id: source.id,
            name: source.name,
            url,
            available: response.statusCode >= 200 && response.statusCode < 400,
            statusCode: response.statusCode,
            firstByteMs: response.firstByteMs,
            totalMs,
            error: ""
        };
    } catch (error) {
        return {
            id: source.id,
            name: source.name,
            url,
            available: false,
            statusCode: 0,
            firstByteMs: null,
            totalMs: now() - startedAt,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

module.exports = {
    probeUpdateSource,
    defaultRequest
};
