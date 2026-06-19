/**
 * 将校验错误列表格式化为对话框详情文本
 * @param {Array} details - 校验错误详情
 * @returns {string} 详情文本
 */
function formatDetails(details) {
    if (!Array.isArray(details) || details.length === 0) return '';

    return details
        .map((item, index) => `${index + 1}. ${item.message}`)
        .join('\n\n');
}

/**
 * 将课表配置错误转换成 Electron 对话框可用的数据
 * @param {Object|null} error - 配置加载错误对象
 * @returns {{title: string, message: string, detail: string}} 对话框内容
 */
function formatScheduleConfigErrorForDialog(error) {
    const title = error?.title || '课表配置加载失败';
    const message = error?.message || '无法读取或解析课表配置文件';
    const sections = [];

    if (error?.filePath) {
        sections.push(`配置文件:\n${error.filePath}`);
    }

    const detailText = formatDetails(error?.details);
    if (detailText) {
        sections.push(`错误详情:\n${detailText}`);
    }

    return {
        title,
        message,
        detail: sections.join('\n\n')
    };
}

module.exports = {
    formatScheduleConfigErrorForDialog
};
