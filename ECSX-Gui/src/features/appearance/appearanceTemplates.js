import { defaults } from './appearanceStyle.js';

/** 中性玻璃模板只提供本地草稿参数，不包含开关状态。 */
export const appearanceTemplates = [
  { id: 'neutral', label: '中性深灰', style: { ...defaults } },
  { id: 'cool', label: '冷灰', style: { backgroundColor: '#303840', blurSigma: 4, opacity: 0.45 } },
  { id: 'warm', label: '暖灰', style: { backgroundColor: '#403a34', blurSigma: 3, opacity: 0.4 } },
  { id: 'dense', label: '浓灰', style: { backgroundColor: '#282828', blurSigma: 6, opacity: 0.65 } },
];
