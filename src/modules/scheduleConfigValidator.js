const { isValidSemesterStartDate } = require('../shared/weekRotation');

/**
 * 判断值是否为普通对象
 * @param {*} value - 待检查的值
 * @returns {boolean} 是否为非数组对象
 */
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 创建统一的校验错误对象
 * @param {string} path - 配置字段路径
 * @param {string} message - 错误说明
 * @returns {{path: string, message: string}} 校验错误
 */
function createError(path, message) {
    return { path, message };
}

/**
 * 获取面向用户的星期名称
 * @param {Object} dayConfig - 每日配置
 * @param {number} dayIndex - 星期索引
 * @returns {string} 星期名称
 */
function getDayLabel(dayConfig, dayIndex) {
    const fallback = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    if (dayConfig?.Chinese) return `星期${dayConfig.Chinese}`;
    return fallback[dayIndex] || `第 ${dayIndex + 1} 天`;
}

/**
 * 获取顶层配置段落的用户可读名称
 * @param {string} key - 配置键名
 * @returns {string} 用户可读名称
 */
function getSectionLabel(key) {
    const labels = {
        subject_name: '科目名称',
        timetable: '时间安排',
        divider: '分隔线',
        daily_class: '每天课程',
        css_style: '课表样式'
    };
    return labels[key] || key;
}

/**
 * 提示某个配置段落缺失或外层括号被破坏
 * @param {string} key - 配置键名
 * @returns {string} 用户友好提示
 */
function createMissingSectionMessage(key) {
    return `没有找到“${getSectionLabel(key)}”这一段请检查 ${key} 是否存在，并且不要删除它外面的花括号`;
}

/**
 * 校验必填顶层对象字段
 * @param {Object} config - 课表配置对象
 * @param {Array} errors - 错误收集数组
 */
function validateTopLevelSections(config, errors) {
    if (!isPlainObject(config)) {
        errors.push(createError('scheduleConfig', '课表配置文件没有写成完整的配置内容请检查最外层的大括号是否还在'));
        return;
    }

    ['subject_name', 'timetable', 'divider'].forEach((key) => {
        if (!isPlainObject(config[key])) {
            errors.push(createError(key, createMissingSectionMessage(key)));
        }
    });

    if (!Array.isArray(config.daily_class)) {
        errors.push(createError('daily_class', '没有找到完整的“每天课程”列表这里需要按星期日到星期六写 7 天课程'));
    } else if (config.daily_class.length !== 7) {
        errors.push(createError('daily_class', `“每天课程”需要正好写 7 天，现在只写了 ${config.daily_class.length} 天请按星期日到星期六补齐`));
    }

    if (config.css_style !== undefined && !isPlainObject(config.css_style)) {
        errors.push(createError('css_style', '“课表样式”这一段格式不对请检查 css_style 外面的花括号是否还在'));
    }
}

/**
 * 校验时间段键名格式
 * @param {Object} timetable - 时间表集合
 * @param {Array} errors - 错误收集数组
 */
function validateTimetableRanges(timetable, errors) {
    if (!isPlainObject(timetable)) return;

    const timeRangePattern = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
    Object.entries(timetable).forEach(([timetableName, ranges]) => {
        if (!isPlainObject(ranges)) {
            errors.push(createError(`timetable.${timetableName}`, `“${timetableName}”这套时间安排格式不对请检查它外面的花括号是否还在`));
            return;
        }

        Object.keys(ranges).forEach((timeRange) => {
            if (!timeRangePattern.test(timeRange)) {
                errors.push(createError(`timetable.${timetableName}["${timeRange}"]`, `${timetableName} 时间安排里的“${timeRange}”格式不对请写成类似 08:00-08:39 这样的两位数字时间`));
            }
        });
    });
}

/**
 * 校验可选的学期起始日期。
 * @param {Object} config 课表配置对象
 * @param {Array} errors 错误收集数组
 */
function validateSemesterStartDate(config, errors) {
    if (config.semester_start_date === undefined || config.semester_start_date === '') return;
    if (!isValidSemesterStartDate(config.semester_start_date)) {
        errors.push(createError('semester_start_date', '“学期起始日期”格式不正确，请使用有效的 YYYY-MM-DD 日期，例如 2026-09-01'));
    }
}

/**
 * 校验单个课程简称是否存在于 subject_name
 * @param {*} subject - 课程简称或轮换课程数组
 * @param {string} path - 字段路径
 * @param {Object} subjectNameMap - 科目名称映射
 * @param {Array} errors - 错误收集数组
 */
function validateSubjectReference(subject, path, subjectNameMap, errors, context) {
    if (Array.isArray(subject)) {
        subject.forEach((item, index) => validateSubjectReference(item, `${path}[${index}]`, subjectNameMap, errors, context));
        return;
    }

    if (typeof subject !== 'string') {
        errors.push(createError(path, `${context.dayLabel}的第 ${context.classNumber} 节课格式不对课程简称需要用引号包起来，例如 '语'`));
        return;
    }

    if (!Object.prototype.hasOwnProperty.call(subjectNameMap, subject)) {
        errors.push(createError(path, `${context.dayLabel}的第 ${context.classNumber} 节课写了“${subject}”，但上面的“科目名称”里没有登记这个简称请在“科目名称”这一段补上 ${subject}，或把这里改成已经登记过的课程简称`));
    }
}

/**
 * 校验每日课表对时间表和科目映射的引用
 * @param {Object} config - 课表配置对象
 * @param {Array} errors - 错误收集数组
 */
function validateDailyClassReferences(config, errors) {
    if (!Array.isArray(config.daily_class) || !isPlainObject(config.subject_name) || !isPlainObject(config.timetable)) {
        return;
    }

    config.daily_class.forEach((dayConfig, dayIndex) => {
        const dayPath = `daily_class[${dayIndex}]`;
        if (!isPlainObject(dayConfig)) {
            errors.push(createError(dayPath, `${getDayLabel(dayConfig, dayIndex)}这一天的课程格式不对请检查这一段外面的花括号是否还在`));
            return;
        }

        const dayLabel = getDayLabel(dayConfig, dayIndex);
        if (!Array.isArray(dayConfig.classList)) {
            errors.push(createError(`${dayPath}.classList`, `${dayLabel}没有找到课程列表请检查 classList 是否存在，并且课程是否写在中括号里`));
            return;
        }

        dayConfig.classList.forEach((subject, classIndex) => {
            validateSubjectReference(subject, `${dayPath}.classList[${classIndex}]`, config.subject_name, errors, {
                dayLabel,
                classNumber: classIndex + 1
            });
        });

        if (typeof dayConfig.timetable !== 'string') {
            errors.push(createError(`${dayPath}.timetable`, `${dayLabel}没有指定要使用哪套时间安排请写成 timetable: 'workday' 这样的形式`));
            return;
        }

        const timetable = config.timetable[dayConfig.timetable];
        if (!isPlainObject(timetable)) {
            errors.push(createError(`${dayPath}.timetable`, `${dayLabel}选择了“${dayConfig.timetable}”这套时间安排，但上面的“时间安排”里没有这一套请补上 timetable.${dayConfig.timetable}，或把这里改成已有的时间安排名称`));
            return;
        }

        Object.entries(timetable).forEach(([timeRange, value]) => {
            if (typeof value !== 'number') return;

            if (!Number.isInteger(value) || value < 0) {
                errors.push(createError(`${dayPath}.timetable -> timetable.${dayConfig.timetable}["${timeRange}"]`, `${dayLabel}使用的 ${dayConfig.timetable} 时间安排中，“${timeRange}”后面应该写课程序号，例如 0 表示第 1 节课，1 表示第 2 节课`));
                return;
            }

            if (value >= dayConfig.classList.length) {
                errors.push(createError(
                    `${dayPath}.timetable -> timetable.${dayConfig.timetable}["${timeRange}"]`,
                    `${dayLabel}使用的 ${dayConfig.timetable} 时间安排中，“${timeRange}”写的是第 ${value + 1} 节课，但${dayLabel}只填写了 ${dayConfig.classList.length} 节课请补齐当天课程，或把这个数字改小`
                ));
            }
        });
    });
}

/**
 * 校验课表配置是否可被渲染进程安全使用
 * @param {*} config - 待校验的课表配置
 * @returns {Array<{path: string, message: string}>} 校验错误列表
 */
function validateScheduleConfig(config) {
    const errors = [];

    validateTopLevelSections(config, errors);
    if (errors.some((error) => error.path === 'scheduleConfig')) return errors;

    validateSemesterStartDate(config, errors);
    validateTimetableRanges(config?.timetable, errors);
    validateDailyClassReferences(config, errors);

    return errors;
}

module.exports = {
    validateScheduleConfig
};
