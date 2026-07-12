(function initializeWeekRotation(root) {
    const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

    /**
     * 解析严格的 YYYY-MM-DD 日期文本。
     * @param {*} value 日期文本
     * @returns {{year: number, month: number, day: number}|null} 日期部分
     */
    function parseDateParts(value) {
        if (typeof value !== 'string') return null;
        const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
            return null;
        }

        return { year, month, day };
    }

    /**
     * 判断学期起始日期是否为空或为有效日期。
     * @param {*} value 日期文本
     * @returns {boolean} 是否可作为配置值
     */
    function isValidSemesterStartDate(value) {
        return value === '' || parseDateParts(value) !== null;
    }

    /**
     * 根据学期起始日期计算当前单双周索引，单周为 0，双周为 1。
     * @param {string} semesterStartDate 学期起始日期
     * @param {Date} currentDate 当前本地日期
     * @returns {number|null} 自动周次索引；未配置或日期无效时返回 null
     */
    function getSemesterWeekIndex(semesterStartDate, currentDate = new Date()) {
        const start = parseDateParts(semesterStartDate);
        if (!start || !(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) return null;

        const startDay = Date.UTC(start.year, start.month - 1, start.day);
        const currentDay = Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
        const elapsedDays = Math.floor((currentDay - startDay) / MILLISECONDS_PER_DAY);
        const weekNumber = Math.max(0, Math.floor(elapsedDays / 7));
        return weekNumber % 2;
    }

    /**
     * 优先使用自动周次，未配置起始日期时回退到手动周次。
     * @param {string} semesterStartDate 学期起始日期
     * @param {Date} currentDate 当前本地日期
     * @param {number} fallbackWeekIndex 手动周次索引
     * @returns {number} 生效的周次索引
     */
    function resolveWeekIndex(semesterStartDate, currentDate, fallbackWeekIndex = 0) {
        const automaticWeekIndex = getSemesterWeekIndex(semesterStartDate, currentDate);
        if (automaticWeekIndex !== null) return automaticWeekIndex;
        return Number.isInteger(fallbackWeekIndex) && fallbackWeekIndex >= 0 ? fallbackWeekIndex : 0;
    }

    const api = {
        getSemesterWeekIndex,
        isValidSemesterStartDate,
        resolveWeekIndex
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ECSXWeekRotation = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
