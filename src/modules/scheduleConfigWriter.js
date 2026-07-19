const fs = require('fs');
const os = require('os');
const path = require('path');
const ScheduleConfigLoader = require('./scheduleConfigLoader');

/**
 * 将待保存源码写入临时文件并复用加载器校验。
 * @param {string} source 待保存的 scheduleConfig.js 源码
 * @param {Object|null} logger 日志记录器
 * @returns {{success: true}|{success: false, error: Object}} 校验结果
 */
function validateScheduleConfigSource(source, logger = null) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecsx-config-save-'));
    const tempFilePath = path.join(tempDir, 'scheduleConfig.js');

    try {
        fs.writeFileSync(tempFilePath, source, 'utf8');
        const result = new ScheduleConfigLoader(tempFilePath, logger).load();
        if (result.success) {
            return { success: true };
        }

        return { success: false, error: result.error };
    } finally {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (error) {
            logger?.warn?.(`[课表配置] 清理临时校验文件失败: ${error.message}`);
        }
    }
}

/**
 * 校验并保存 scheduleConfig.js 源码，校验失败时不会覆盖原文件。
 * @param {{filePath: string, source: string, logger?: Object|null}} options 保存参数
 * @returns {{success: true, filePath: string}|{success: false, error: Object}} 保存结果
 */
function saveScheduleConfigSource({ filePath, source, logger = null }) {
    if (typeof source !== 'string' || source.trim() === '') {
        logger?.warn?.(`[课表配置] 保存被拒绝: 配置内容为空，目标文件: ${filePath}`);
        return {
            success: false,
            error: {
                type: 'validation',
                title: '课表配置保存失败',
                message: '配置内容不能为空',
                filePath
            }
        };
    }

    logger?.info?.(`[课表配置] 开始保存配置源码: ${filePath}，长度: ${source.length}`);
    const validation = validateScheduleConfigSource(source, logger);
    if (!validation.success) {
        const detailText = Array.isArray(validation.error?.details)
            ? validation.error.details.map((item) => `${item.path}: ${item.message}`).join('; ')
            : validation.error?.message || '未知错误';
        logger?.warn?.(`[课表配置] 保存校验失败: ${detailText}`);
        return validation;
    }

    const directory = path.dirname(filePath);
    const temporaryFilePath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
    try {
        fs.writeFileSync(temporaryFilePath, source, 'utf8');
        fs.renameSync(temporaryFilePath, filePath);
        logger?.info?.(`[课表配置] 保存成功: ${filePath}`);
        return { success: true, filePath };
    } catch (error) {
        try {
            fs.rmSync(temporaryFilePath, { force: true });
        } catch (cleanupError) {
            logger?.warn?.(`[课表配置] 清理临时保存文件失败: ${cleanupError.message}`);
        }
        logger?.error?.(`[课表配置] 保存失败: ${error.message}`);
        return {
            success: false,
            error: {
                type: 'write',
                title: '课表配置保存失败',
                message: error.message,
                filePath
            }
        };
    }
}

module.exports = {
    saveScheduleConfigSource,
    validateScheduleConfigSource
};
