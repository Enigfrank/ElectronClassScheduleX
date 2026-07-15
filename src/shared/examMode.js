(function initializeExamMode(root) {
    const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
    const SECONDS_PER_MINUTE = 60;

    /**
     * @typedef {{subject: string, startTime: string, endTime: string}} ExamEntry
     */

    /**
     * @typedef {{index: number|null, field: string, code: string, message: string}} ExamValidationError
     */

    /**
     * 解析严格的 24 小时制 HH:mm 文本。
     * @param {*} value 时间文本
     * @returns {{text: string, minutes: number}|null} 规范化时间及分钟数
     */
    function parseExamTime(value) {
        if (typeof value !== 'string') return null;
        const text = value.trim();
        const match = text.match(TIME_PATTERN);
        if (!match) return null;

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (hours > 23 || minutes > 59) return null;

        return {
            text,
            minutes: hours * 60 + minutes
        };
    }

    /**
     * 添加一条不重复的字段校验错误。
     * @param {ExamValidationError[]} errors 错误集合
     * @param {ExamValidationError} error 待添加错误
     */
    function addValidationError(errors, error) {
        const exists = errors.some((item) => item.index === error.index && item.field === error.field && item.code === error.code);
        if (!exists) errors.push(error);
    }

    /**
     * 规范化并校验考试条目。
     * @param {*} input 未信任的考试条目
     * @param {{requireEntries?: boolean}} [options] 校验选项
     * @returns {{valid: true, entries: ExamEntry[]}|{valid: false, errors: ExamValidationError[]}} 校验结果
     */
    function normalizeExamEntries(input, options = {}) {
        const requireEntries = options.requireEntries !== false;
        const errors = [];

        if (!Array.isArray(input)) {
            return {
                valid: false,
                errors: [{
                    index: null,
                    field: 'entries',
                    code: 'invalid-type',
                    message: '考试科目配置格式无效'
                }]
            };
        }

        if (requireEntries && input.length === 0) {
            return {
                valid: false,
                errors: [{
                    index: null,
                    field: 'entries',
                    code: 'required',
                    message: '请至少添加一个考试科目'
                }]
            };
        }

        const candidates = input.map((entry, index) => {
            const value = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
            const subject = typeof value.subject === 'string' ? value.subject.trim() : '';
            const start = parseExamTime(value.startTime);
            const end = parseExamTime(value.endTime);

            if (!subject) {
                addValidationError(errors, {
                    index,
                    field: 'subject',
                    code: 'required',
                    message: '请输入考试科目'
                });
            }

            if (!start) {
                addValidationError(errors, {
                    index,
                    field: 'startTime',
                    code: 'invalid-time',
                    message: '请选择有效的开始时间'
                });
            }

            if (!end) {
                addValidationError(errors, {
                    index,
                    field: 'endTime',
                    code: 'invalid-time',
                    message: '请选择有效的结束时间'
                });
            }

            if (start && end && end.minutes <= start.minutes) {
                addValidationError(errors, {
                    index,
                    field: 'endTime',
                    code: 'invalid-range',
                    message: '结束时间必须晚于开始时间'
                });
            }

            return {
                originalIndex: index,
                subject,
                startTime: start?.text || '',
                endTime: end?.text || '',
                startMinutes: start?.minutes ?? null,
                endMinutes: end?.minutes ?? null
            };
        });

        const validRanges = candidates
            .filter((entry) => entry.startMinutes !== null && entry.endMinutes !== null && entry.endMinutes > entry.startMinutes)
            .sort((left, right) => left.startMinutes - right.startMinutes || left.originalIndex - right.originalIndex);

        let activeRange = null;
        for (const entry of validRanges) {
            if (activeRange && entry.startMinutes < activeRange.endMinutes) {
                const activeLabel = activeRange.subject || `第 ${activeRange.originalIndex + 1} 行`;
                const entryLabel = entry.subject || `第 ${entry.originalIndex + 1} 行`;
                addValidationError(errors, {
                    index: entry.originalIndex,
                    field: 'startTime',
                    code: 'overlap',
                    message: `与“${activeLabel}”的时间段重叠`
                });
                addValidationError(errors, {
                    index: activeRange.originalIndex,
                    field: 'endTime',
                    code: 'overlap',
                    message: `与“${entryLabel}”的时间段重叠`
                });
            }

            if (!activeRange || entry.endMinutes > activeRange.endMinutes) {
                activeRange = entry;
            }
        }

        if (errors.length > 0) return { valid: false, errors };

        const entries = candidates
            .sort((left, right) => left.startMinutes - right.startMinutes || left.originalIndex - right.originalIndex)
            .map(({ subject, startTime, endTime }) => ({ subject, startTime, endTime }));

        return { valid: true, entries };
    }

    /**
     * 根据本机当前时间确定正在进行、下一场或全部结束状态。
     * @param {ExamEntry[]} entries 已规范化且按开始时间排序的考试条目
     * @param {Date} [currentDate] 本机当前时间
     * @returns {{status: 'current'|'next'|'ended', entry: ExamEntry|null}} 展示状态
     */
    function resolveExamDisplayState(entries, currentDate = new Date()) {
        if (!(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) {
            return { status: 'ended', entry: null };
        }

        const currentSeconds = currentDate.getHours() * 3600
            + currentDate.getMinutes() * SECONDS_PER_MINUTE
            + currentDate.getSeconds()
            + currentDate.getMilliseconds() / 1000;

        for (const entry of Array.isArray(entries) ? entries : []) {
            const start = parseExamTime(entry?.startTime);
            const end = parseExamTime(entry?.endTime);
            if (!start || !end) continue;

            const startSeconds = start.minutes * SECONDS_PER_MINUTE;
            const endSeconds = end.minutes * SECONDS_PER_MINUTE;
            if (currentSeconds >= startSeconds && currentSeconds < endSeconds) {
                return { status: 'current', entry };
            }
            if (currentSeconds < startSeconds) {
                return { status: 'next', entry };
            }
        }

        return { status: 'ended', entry: null };
    }

    /**
     * 将本机时间格式化为固定两位的 HH:mm:ss。
     * @param {Date} [currentDate] 本机当前时间
     * @returns {string} 时钟文本
     */
    function formatExamClock(currentDate = new Date()) {
        if (!(currentDate instanceof Date) || Number.isNaN(currentDate.getTime())) return '--:--:--';
        const pad = (value) => String(value).padStart(2, '0');
        return `${pad(currentDate.getHours())}:${pad(currentDate.getMinutes())}:${pad(currentDate.getSeconds())}`;
    }

    const api = {
        formatExamClock,
        normalizeExamEntries,
        resolveExamDisplayState
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.ECSXExamMode = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));
