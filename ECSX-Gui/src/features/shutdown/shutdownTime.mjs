/**
 * 校验用户输入的定时关机时间，并返回可直接保存的 HH:mm 字符串。
 * @param {string} rawTime 用户输入的时间文本
 * @returns {{valid: true, value: string} | {valid: false, message: string}} 校验结果
 */
export function validateShutdownTime(rawTime) {
  const value = String(rawTime || '').trim();

  if (!value) {
    return { valid: false, message: '请输入定时关机时间' };
  }

  if (!/^\d{2}:\d{2}$/.test(value)) {
    return { valid: false, message: '请输入 HH:mm 格式的时间，例如 12:11' };
  }

  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (hour > 23 || minute > 59) {
    return { valid: false, message: '请输入 00:00 到 23:59 之间的时间' };
  }

  return { valid: true, value };
}
