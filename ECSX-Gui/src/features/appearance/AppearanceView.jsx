import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Flex, FormControl, FormErrorMessage, FormLabel,
  Heading, Input, InputGroup, InputRightAddon, Spinner, Switch, Text,
} from '@chakra-ui/react';
import { RotateCcw, Save } from 'lucide-react';
import CommitSlider from '../../components/CommitSlider.jsx';
import AppearancePreview from './AppearancePreview.jsx';
import { defaults, limits, numericFields, parseDraft, parseField, readStyle, sameStyle, toDraft } from './appearanceStyle.js';
import { appearanceTemplates } from './appearanceTemplates.js';
import './appearance.css';

/**
 * 管理本地样式草稿；只有显式保存才应用全局参数，启停开关仍实时生效。
 * @param {{ipcRenderer: {invoke: Function}, enabled: boolean, isTogglePending: boolean, onToggle: Function,
 * globalEnabled?: boolean, isGlobalTogglePending?: boolean, onGlobalToggle?: Function}} props 页面依赖
 * @returns {React.ReactElement} 界面配置视图
 */
export default function AppearanceView({ ipcRenderer, enabled, isTogglePending, onToggle,
  globalEnabled = false, isGlobalTogglePending = false, onGlobalToggle }) {
  const [style, setStyle] = useState(null);
  const [draft, setDraft] = useState(() => toDraft(defaults));
  const [operation, setOperation] = useState('loading');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const lifecycle = useRef(null);
  const confirmedStyle = useRef(null);
  const draftRef = useRef(draft);

  /** 同步本地草稿引用，让失焦后立即点击保存也能取得最新完整输入。 */
  function replaceDraft(nextDraft) {
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  }

  /** 只有经过校验的主进程回执才能成为已保存状态。 */
  function applyStyle(nextStyle) {
    confirmedStyle.current = nextStyle;
    setStyle(nextStyle);
    replaceDraft(toDraft(nextStyle));
    setFieldErrors({});
  }

  /** 初次加载或重试；同一生命周期内禁止并发请求。 */
  async function loadStyle(token = lifecycle.current) {
    if (!token?.active || token.busy) return;
    token.busy = true;
    setOperation('loading');
    setError('');
    try {
      const result = await ipcRenderer.invoke('get-mini-countdown-glass-style');
      if (token.active) applyStyle(readStyle(result));
    } catch (cause) {
      if (token.active) setError(`加载样式失败：${cause?.message || String(cause)}`);
    } finally {
      token.busy = false;
      if (token.active) setOperation('');
    }
  }

  useEffect(() => {
    const token = { active: true, busy: false };
    lifecycle.current = token;
    confirmedStyle.current = null;
    setStyle(null);
    loadStyle(token);
    return () => { token.active = false; };
  }, [ipcRenderer]);

  /** 显式保存完整草稿；失败保留输入，成功采用主进程实际确认值。 */
  async function saveStyle() {
    const token = lifecycle.current;
    const previous = confirmedStyle.current;
    if (!token?.active || token.busy || !previous) return;
    const parsed = parseDraft(draftRef.current, previous);
    setFieldErrors(parsed.errors);
    if (Object.keys(parsed.errors).length) return;
    setError('');
    if (sameStyle(previous, parsed.style)) {
      replaceDraft(toDraft(previous));
      return;
    }
    token.busy = true;
    setOperation('saving');
    try {
      const result = await ipcRenderer.invoke('set-mini-countdown-glass-style', parsed.style);
      if (token.active) applyStyle(readStyle(result));
    } catch (cause) {
      if (token.active) setError(`保存样式失败，草稿已保留，可重试：${cause?.message || String(cause)}`);
    } finally {
      token.busy = false;
      if (token.active) setOperation('');
    }
  }

  /** 输入和滑块结束事件只修改本地草稿，不发出保存请求。 */
  function changeDraft(key, value) {
    if (!lifecycle.current?.active || lifecycle.current.busy || !confirmedStyle.current) return;
    replaceDraft({ ...draftRef.current, [key]: value });
    setFieldErrors(previous => ({ ...previous, [key]: '' }));
  }

  /** 失焦或回车时显示单项错误，保留草稿和模拟状态。 */
  function validateField(key, text) {
    if (!lifecycle.current?.active || lifecycle.current.busy || !confirmedStyle.current) return;
    changeDraft(key, text);
    const parsed = parseField(key, text);
    setFieldErrors(previous => ({ ...previous, [key]: parsed.error || '' }));
  }

  /** 回车仅完成当前字段校验，应用必须通过保存按钮。 */
  function handleEnter(event, key) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    validateField(key, event.currentTarget.value);
  }

  /** 模板和恢复默认只替换本地参数，不改变任意玻璃开关。 */
  function chooseStyle(nextStyle) {
    if (!lifecycle.current?.active || lifecycle.current.busy || !confirmedStyle.current) return;
    replaceDraft(toDraft(nextStyle));
    setFieldErrors({});
    setError('');
  }

  const isBusy = operation !== '';
  const isDisabled = isBusy || style === null;
  const parsedDraft = parseDraft(draft, style || defaults);
  const hasDraft = style !== null && !sameStyle(draft, toDraft(style));
  const pickerColor = parsedDraft.style.backgroundColor;

  return (
    <Box className="appearance-view">
      <Heading as="h2" className="appearance-heading">液态玻璃</Heading>
      <Text className="appearance-muted">开关立即生效；颜色、模糊与不透明度仅在“保存并应用”后用于所有玻璃区域。</Text>
      <Box className="appearance-toggles">
        <Flex className="appearance-toggle-row">
          <Box>
            <FormLabel htmlFor="appearance-global-glass-enabled" className="appearance-label">主课表液态玻璃</FormLabel>
            <Text className="appearance-muted">主课表、侧栏和课程倒计时，独立启停。</Text>
          </Box>
          <Switch id="appearance-global-glass-enabled" aria-label="主课表液态玻璃" className="appearance-switch"
            isChecked={globalEnabled} isDisabled={isGlobalTogglePending || isBusy || !onGlobalToggle} onChange={onGlobalToggle} />
        </Flex>
        <Flex className="appearance-toggle-row">
          <Box>
            <FormLabel htmlFor="appearance-glass-enabled" className="appearance-label">迷你倒计时液态玻璃</FormLabel>
            <Text className="appearance-muted">下节课提示跟随迷你倒计时模式。</Text>
          </Box>
          <Switch id="appearance-glass-enabled" aria-label="迷你倒计时液态玻璃" className="appearance-switch"
            isChecked={enabled} isDisabled={isTogglePending || isBusy} onChange={onToggle} />
        </Flex>
      </Box>

      {error && <Alert status="error" role="alert" className="appearance-error"><AlertIcon /><Text>{error}</Text></Alert>}
      {operation === 'loading' && (
        <Flex role="status" className="appearance-loading"><Spinner /><Text>正在加载样式...</Text></Flex>
      )}
      {!style && operation !== 'loading' && <Button className="appearance-button" onClick={() => loadStyle()}>重试加载</Button>}

      {style && (
        <Box className="appearance-editor">
          <Box className="appearance-field">
            <Heading as="h3" className="appearance-subheading">样式草稿</Heading>
            <Text className="appearance-muted">选择模板仅更新草稿和模拟演示，不会自动启用玻璃。离开此页面会丢弃未保存的草稿。</Text>
            <Flex className="appearance-template-list" aria-label="玻璃样式模板">
              {appearanceTemplates.map(template => (
                <Button key={template.id} className="appearance-button" variant="outline" isDisabled={isDisabled}
                  aria-pressed={!Object.keys(parsedDraft.errors).length && sameStyle(parsedDraft.style, template.style)}
                  onClick={() => chooseStyle(template.style)}>{template.label}</Button>
              ))}
            </Flex>
          </Box>
          <FormControl className="appearance-field" isInvalid={Boolean(fieldErrors.backgroundColor)} isDisabled={isDisabled}>
            <FormLabel htmlFor="appearance-glass-color" className="appearance-label">背景颜色 / 染色</FormLabel>
            <Flex className="appearance-input-row">
              <Input type="color" aria-label="液态玻璃背景颜色选择器" className="appearance-input appearance-color-picker"
                value={pickerColor} isDisabled={isDisabled} onChange={event => changeDraft('backgroundColor', event.target.value)}
                onBlur={event => validateField('backgroundColor', event.currentTarget.value)} />
              <Input id="appearance-glass-color" aria-label="液态玻璃背景颜色" value={draft.backgroundColor}
                className="appearance-input appearance-hex-input" autoComplete="off" spellCheck={false} isDisabled={isDisabled}
                onChange={event => changeDraft('backgroundColor', event.target.value)}
                onBlur={event => validateField('backgroundColor', event.currentTarget.value)}
                onKeyDown={event => handleEnter(event, 'backgroundColor')} />
            </Flex>
            <FormErrorMessage className="appearance-field-error">{fieldErrors.backgroundColor}</FormErrorMessage>
          </FormControl>

          {numericFields.map(({ key, label, ariaLabel, scale }) => {
            const range = limits[key];
            return (
              <FormControl key={key} className="appearance-field" isInvalid={Boolean(fieldErrors[key])} isDisabled={isDisabled}>
                <FormLabel htmlFor={`appearance-glass-${key}`} className="appearance-label">{label}</FormLabel>
                <Flex className="appearance-input-row">
                  <Box className="appearance-slider">
                    <CommitSlider ariaLabel={ariaLabel} value={parsedDraft.style[key] * scale} min={range.min * scale}
                      max={range.max * scale} step={range.step * scale} isDisabled={isDisabled}
                      onCommit={value => validateField(key, String(value))} />
                  </Box>
                  <InputGroup className="appearance-number-input">
                    <Input id={`appearance-glass-${key}`} aria-label={`${ariaLabel}数值`} type="text"
                      className="appearance-input" inputMode={key === 'opacity' ? 'numeric' : 'decimal'} value={draft[key]} isDisabled={isDisabled}
                      onChange={event => changeDraft(key, event.target.value)}
                      onBlur={event => validateField(key, event.currentTarget.value)}
                      onKeyDown={event => handleEnter(event, key)} />
                    {key === 'opacity' && <InputRightAddon className="appearance-addon">%</InputRightAddon>}
                  </InputGroup>
                </Flex>
                <FormErrorMessage className="appearance-field-error">{fieldErrors[key]}</FormErrorMessage>
              </FormControl>
            );
          })}

          <AppearancePreview styleValue={parsedDraft.style} enabled={enabled} globalEnabled={globalEnabled}
            hasInvalidDraft={Boolean(Object.keys(parsedDraft.errors).length)} />

          <Flex className="appearance-actions">
            <Button className="appearance-button" variant="outline" leftIcon={<RotateCcw className="appearance-icon" />}
              isDisabled={isDisabled} onClick={() => chooseStyle(defaults)}>恢复默认样式</Button>
            <Button className="appearance-button appearance-button-primary" leftIcon={<Save className="appearance-icon" />}
              isDisabled={isDisabled || !hasDraft} isLoading={operation === 'saving'} loadingText="正在保存"
              onClick={saveStyle}>保存并应用</Button>
            <Text role="status" className="appearance-muted">
              {operation === 'saving' ? '正在保存，等待主进程确认...' : hasDraft ? '草稿未保存，仅用于模拟' : '已保存（主进程已确认）'}
            </Text>
          </Flex>
        </Box>
      )}
    </Box>
  );
}
