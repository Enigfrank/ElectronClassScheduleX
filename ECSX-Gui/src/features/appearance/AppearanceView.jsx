import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, AlertIcon, Box, Button, Flex, FormControl, FormErrorMessage, FormLabel,
  Heading, Input, InputGroup, InputRightAddon, Spinner, Stack, Switch, Text, useColorModeValue,
} from '@chakra-ui/react';
import { RotateCcw } from 'lucide-react';
import CommitSlider from '../../components/CommitSlider.jsx';
import { defaults, limits, numericFields, parseField, readStyle, sameStyle, toDraft } from './appearanceStyle.js';

/**
 * 管理迷你倒计时液态玻璃样式；持久化仅发生在明确的编辑结束边界。
 * @param {{ipcRenderer: {invoke: Function}, enabled: boolean, isTogglePending: boolean, onToggle: Function}} props 页面依赖
 * @returns {React.ReactElement} 界面配置视图
 */
export default function AppearanceView({ ipcRenderer, enabled, isTogglePending, onToggle }) {
  const [style, setStyle] = useState(null);
  const [draft, setDraft] = useState(() => toDraft(defaults));
  const [operation, setOperation] = useState('loading');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const lifecycle = useRef(null);
  const confirmedStyle = useRef(null);
  const mutedColor = useColorModeValue('gray.600', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  /** 同步主进程确认的样式，同时复位表单与滑块草稿。 */
  function applyStyle(nextStyle) {
    confirmedStyle.current = nextStyle;
    setStyle(nextStyle);
    setDraft(toDraft(nextStyle));
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
    loadStyle(token);
    return () => { token.active = false; };
  }, [ipcRenderer]);

  /** 串行保存完整样式；成功使用回执，失败恢复上次确认的值。 */
  async function saveStyle(nextStyle) {
    const token = lifecycle.current;
    const previous = confirmedStyle.current;
    if (!token?.active || token.busy || !previous) return;
    setError('');
    setFieldErrors({});
    setDraft(toDraft(nextStyle));
    if (sameStyle(previous, nextStyle)) return;
    token.busy = true;
    setOperation('saving');
    try {
      const result = await ipcRenderer.invoke('set-mini-countdown-glass-style', nextStyle);
      if (token.active) applyStyle(readStyle(result));
    } catch (cause) {
      if (token.active) {
        applyStyle(previous);
        setError(`保存样式失败，已恢复上次保存的样式：${cause?.message || String(cause)}`);
      }
    } finally {
      token.busy = false;
      if (token.active) setOperation('');
    }
  }

  /** 普通输入只更新草稿，不调用主进程。 */
  function changeDraft(key, value) {
    setDraft(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => ({ ...previous, [key]: '' }));
  }

  /** 失焦、回车或滑块松手时，校验单项并合并到已确认的完整样式。 */
  function commitField(key, text) {
    if (lifecycle.current?.busy || !confirmedStyle.current) return;
    const parsed = parseField(key, text);
    if (parsed.error) {
      setFieldErrors(previous => ({ ...previous, [key]: parsed.error }));
      return;
    }
    saveStyle({ ...confirmedStyle.current, [key]: parsed.value });
  }

  /** 回车提交当前文本，并阻止表单或数字输入产生附加动作。 */
  function handleEnter(event, key) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitField(key, event.currentTarget.value);
  }

  const isBusy = operation !== '';
  const isDisabled = isBusy || style === null;
  const hasDraft = style !== null && !sameStyle(draft, toDraft(style));
  const pickerColor = /^#[0-9a-f]{6}$/i.test(draft.backgroundColor)
    ? draft.backgroundColor : (style || defaults).backgroundColor;

  return (
    <Box minW={0} maxW="container.md">
      <Heading as="h2" fontSize="xl" fontWeight="semibold" mb={6}>迷你倒计时</Heading>
      <Flex align="center" justify="space-between" gap={4} pb={6} borderBottom="1px" borderColor={borderColor}>
        <FormLabel htmlFor="appearance-glass-enabled" mb={0}>液态玻璃</FormLabel>
        <Switch id="appearance-glass-enabled" aria-label="迷你倒计时液态玻璃"
          isChecked={enabled} isDisabled={isTogglePending || isBusy} onChange={onToggle} colorScheme="blue" />
      </Flex>

      {error && <Alert status="error" role="alert" mt={4}><AlertIcon /><Text minW={0} overflowWrap="anywhere">{error}</Text></Alert>}
      {operation === 'loading' && (
        <Flex role="status" align="center" gap={3} py={6}><Spinner size="sm" /><Text>正在加载样式...</Text></Flex>
      )}
      {!style && operation !== 'loading' && <Button mt={4} onClick={() => loadStyle()}>重试加载</Button>}

      {style && (
        <Stack spacing={6} pt={6}>
          <FormControl isInvalid={Boolean(fieldErrors.backgroundColor)} isDisabled={isDisabled}>
            <FormLabel htmlFor="appearance-glass-color">背景颜色</FormLabel>
            <Flex gap={3} align="center" flexWrap="wrap">
              <Input type="color" aria-label="液态玻璃背景颜色选择器" value={pickerColor} w={16} flexShrink={0}
                isDisabled={isDisabled} onChange={event => changeDraft('backgroundColor', event.target.value)}
                onBlur={event => commitField('backgroundColor', event.currentTarget.value)} />
              <Input id="appearance-glass-color" aria-label="液态玻璃背景颜色" value={draft.backgroundColor}
                flex={1} minW={0} maxW={48} autoComplete="off" spellCheck={false} isDisabled={isDisabled}
                onChange={event => changeDraft('backgroundColor', event.target.value)}
                onBlur={event => commitField('backgroundColor', event.currentTarget.value)}
                onKeyDown={event => handleEnter(event, 'backgroundColor')} />
            </Flex>
            <FormErrorMessage>{fieldErrors.backgroundColor}</FormErrorMessage>
          </FormControl>

          {numericFields.map(({ key, label, ariaLabel, scale }) => {
            const range = limits[key];
            const parsed = parseField(key, draft[key]);
            const sliderValue = (parsed.error ? style[key] : parsed.value) * scale;
            return (
              <FormControl key={key} isInvalid={Boolean(fieldErrors[key])} isDisabled={isDisabled}>
                <FormLabel htmlFor={`appearance-glass-${key}`}>{label}</FormLabel>
                <Flex align="center" gap={6} flexWrap="wrap">
                  <Box flex={1} minW={32} py={2}>
                    <CommitSlider ariaLabel={ariaLabel} value={sliderValue} min={range.min * scale}
                      max={range.max * scale} step={range.step * scale} isDisabled={isDisabled}
                      onCommit={value => commitField(key, String(value))} />
                  </Box>
                  <InputGroup w={32} flexShrink={0}>
                    <Input id={`appearance-glass-${key}`} aria-label={`${ariaLabel}数值`} type="text"
                      inputMode={key === 'opacity' ? 'numeric' : 'decimal'} value={draft[key]} isDisabled={isDisabled}
                      onChange={event => changeDraft(key, event.target.value)}
                      onBlur={event => commitField(key, event.currentTarget.value)}
                      onKeyDown={event => handleEnter(event, key)} />
                    {key === 'opacity' && <InputRightAddon>%</InputRightAddon>}
                  </InputGroup>
                </Flex>
                <FormErrorMessage>{fieldErrors[key]}</FormErrorMessage>
              </FormControl>
            );
          })}

          <Flex align="center" gap={4} flexWrap="wrap" pt={4} borderTop="1px" borderColor={borderColor}>
            <Button variant="outline" leftIcon={<RotateCcw size={16} />} isDisabled={isDisabled}
              onClick={() => saveStyle({ ...defaults })}>恢复默认样式</Button>
            <Text role="status" fontSize="sm" color={mutedColor}>
              {operation === 'saving' ? '正在保存...' : hasDraft ? '未保存' : '已保存'}
            </Text>
          </Flex>
        </Stack>
      )}
    </Box>
  );
}
