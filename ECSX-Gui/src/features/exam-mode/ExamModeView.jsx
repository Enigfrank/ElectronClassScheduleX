import React, { useEffect, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Center,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  IconButton,
  Input,
  Spinner,
  Text,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { Check, Plus, Trash2 } from 'lucide-react';

let nextDraftId = 0;

/**
 * 创建带稳定前端标识的考试草稿行。
 * @param {{subject?: string, startTime?: string, endTime?: string}} [entry] 已保存考试条目
 * @returns {{id: string, subject: string, startTime: string, endTime: string}} 草稿行
 */
function createDraftEntry(entry = {}) {
  nextDraftId += 1;
  return {
    id: `exam-entry-${Date.now()}-${nextDraftId}`,
    subject: typeof entry.subject === 'string' ? entry.subject : '',
    startTime: typeof entry.startTime === 'string' ? entry.startTime : '',
    endTime: typeof entry.endTime === 'string' ? entry.endTime : '',
  };
}

/**
 * 将主进程的原始行号错误映射到稳定草稿 ID。
 * @param {Array<Object>} errors 主进程校验错误
 * @param {Array<Object>} submittedRows 本次提交的草稿行
 * @returns {{fields: Record<string, string>, form: string}} 页面错误
 */
function mapValidationErrors(errors, submittedRows) {
  const fields = {};
  let form = '';

  for (const error of Array.isArray(errors) ? errors : []) {
    if (!Number.isInteger(error?.index)) {
      form = typeof error?.message === 'string' ? error.message : '考试配置无效';
      continue;
    }

    const row = submittedRows[error.index];
    if (!row || typeof error.field !== 'string') continue;
    fields[`${row.id}:${error.field}`] = typeof error.message === 'string' ? error.message : '此字段无效';
  }

  return { fields, form };
}

/**
 * 显示考试模式配置页。
 * @param {{ipcRenderer: Electron.IpcRenderer}} props 组件属性
 * @returns {React.ReactElement} 考试模式配置页
 */
export default function ExamModeView({ ipcRenderer }) {
  const [rows, setRows] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);

  const rowBackground = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const mutedTextColor = useColorModeValue('gray.600', 'gray.400');
  const errorTextColor = useColorModeValue('red.600', 'red.300');

  useEffect(() => {
    let isMounted = true;

    /**
     * 从主进程加载最近保存的考试配置。
     * @returns {Promise<void>} 加载完成
     */
    async function loadConfiguration() {
      try {
        const result = await ipcRenderer.invoke('get-exam-mode-config');
        if (!isMounted) return;

        const loadedEntries = result?.success && Array.isArray(result.entries) ? result.entries : [];
        setRows(loadedEntries.length > 0 ? loadedEntries.map(createDraftEntry) : [createDraftEntry()]);
        if (!result?.success) {
          setNotice({ status: 'error', message: result?.error || '无法读取考试配置' });
        }
      } catch (error) {
        if (!isMounted) return;
        setRows([createDraftEntry()]);
        setNotice({
          status: 'error',
          message: `读取考试配置失败：${error instanceof Error ? error.message : String(error)}`,
        });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadConfiguration();
    return () => {
      isMounted = false;
    };
  }, [ipcRenderer]);

  /**
   * 读取指定草稿字段的校验错误。
   * @param {string} rowId 草稿 ID
   * @param {string} field 字段名
   * @returns {string} 错误文本
   */
  function getFieldError(rowId, field) {
    return fieldErrors[`${rowId}:${field}`] || '';
  }

  /**
   * 更新一项草稿字段并清除对应旧错误。
   * @param {string} rowId 草稿 ID
   * @param {'subject'|'startTime'|'endTime'} field 字段名
   * @param {string} value 新值
   */
  function updateRow(rowId, field, value) {
    setRows((currentRows) => currentRows.map((row) => (
      row.id === rowId ? { ...row, [field]: value } : row
    )));
    setFieldErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[`${rowId}:${field}`];
      return nextErrors;
    });
    setFormError('');
    setNotice(null);
  }

  /**
   * 追加一条空白考试科目草稿。
   */
  function addRow() {
    setRows((currentRows) => [...currentRows, createDraftEntry()]);
    setFormError('');
    setNotice(null);
  }

  /**
   * 删除指定考试科目草稿。
   * @param {string} rowId 草稿 ID
   */
  function deleteRow(rowId) {
    setRows((currentRows) => currentRows.filter((row) => row.id !== rowId));
    setFieldErrors((currentErrors) => Object.fromEntries(
      Object.entries(currentErrors).filter(([key]) => !key.startsWith(`${rowId}:`))
    ));
    setFormError('');
    setNotice(null);
  }

  /**
   * 提交完整考试配置并请求进入全屏模式。
   * @param {React.FormEvent<HTMLFormElement>} event 表单事件
   * @returns {Promise<void>} 应用完成
   */
  async function applyConfiguration(event) {
    event.preventDefault();
    if (isApplying) return;

    const submittedRows = rows;
    const payload = submittedRows.map(({ subject, startTime, endTime }) => ({
      subject,
      startTime,
      endTime,
    }));

    setIsApplying(true);
    setFieldErrors({});
    setFormError('');
    setNotice(null);

    try {
      const result = await ipcRenderer.invoke('apply-exam-mode', payload);
      if (result?.success) {
        const savedEntries = Array.isArray(result.entries) ? result.entries : payload;
        setRows(savedEntries.map(createDraftEntry));
        setNotice({ status: 'success', message: '考试模式已应用' });
        return;
      }

      const mappedErrors = mapValidationErrors(result?.errors, submittedRows);
      setFieldErrors(mappedErrors.fields);
      setFormError(mappedErrors.form);

      if (result?.saved && Array.isArray(result.entries)) {
        setRows(result.entries.map(createDraftEntry));
      }
      if (result?.error) {
        setNotice({ status: 'error', message: result.error });
      }
    } catch (error) {
      setNotice({
        status: 'error',
        message: `应用考试模式失败：${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setIsApplying(false);
    }
  }

  if (isLoading) {
    return (
      <Center minH="240px">
        <Spinner thickness="3px" speed="0.7s" color="blue.500" size="lg" />
      </Center>
    );
  }

  return (
    <Box as="form" onSubmit={applyConfiguration} maxW="1000px" mx="auto">
      <Flex align="center" justify="space-between" gap={4} mb={6} flexWrap="wrap">
        <Box>
          <Text fontSize="xl" fontWeight="semibold">考试安排</Text>
          <Text fontSize="sm" color={mutedTextColor}>科目与起止时间</Text>
        </Box>
        <Flex gap={3}>
          <Button type="button" variant="outline" leftIcon={<Plus size={18} />} onClick={addRow} isDisabled={isApplying}>
            添加科目
          </Button>
          <Button type="submit" colorScheme="blue" leftIcon={<Check size={18} />} isLoading={isApplying} loadingText="正在应用">
            应用
          </Button>
        </Flex>
      </Flex>

      {notice && (
        <Alert status={notice.status} mb={4} borderRadius="md">
          <AlertIcon />
          {notice.message}
        </Alert>
      )}

      {formError && (
        <Alert status="error" mb={4} borderRadius="md">
          <AlertIcon />
          {formError}
        </Alert>
      )}

      {rows.length === 0 ? (
        <Center minH="160px" border="1px solid" borderColor={borderColor} borderRadius="md" bg={rowBackground}>
          <Text color={mutedTextColor}>暂无考试科目</Text>
        </Center>
      ) : (
        <Flex direction="column" gap={4}>
          {rows.map((row, index) => {
            const subjectError = getFieldError(row.id, 'subject');
            const startError = getFieldError(row.id, 'startTime');
            const endError = getFieldError(row.id, 'endTime');

            return (
              <Grid
                key={row.id}
                templateColumns="minmax(180px, 1fr) minmax(120px, 144px) minmax(120px, 144px) 44px"
                gap={3}
                alignItems="start"
                p={4}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="md"
                bg={rowBackground}
              >
                <FormControl isInvalid={Boolean(subjectError)}>
                  <FormLabel htmlFor={`${row.id}-subject`} fontSize="sm">科目 {index + 1}</FormLabel>
                  <Input
                    id={`${row.id}-subject`}
                    value={row.subject}
                    onChange={(event) => updateRow(row.id, 'subject', event.target.value)}
                    placeholder="考试科目"
                    isDisabled={isApplying}
                  />
                  <Text minH="20px" mt={1} fontSize="xs" color={errorTextColor} visibility={subjectError ? 'visible' : 'hidden'}>
                    {subjectError || '无错误'}
                  </Text>
                </FormControl>

                <FormControl isInvalid={Boolean(startError)}>
                  <FormLabel htmlFor={`${row.id}-start`} fontSize="sm">开始时间</FormLabel>
                  <Input
                    id={`${row.id}-start`}
                    type="time"
                    step={60}
                    value={row.startTime}
                    onChange={(event) => updateRow(row.id, 'startTime', event.target.value)}
                    isDisabled={isApplying}
                  />
                  <Text minH="20px" mt={1} fontSize="xs" color={errorTextColor} visibility={startError ? 'visible' : 'hidden'}>
                    {startError || '无错误'}
                  </Text>
                </FormControl>

                <FormControl isInvalid={Boolean(endError)}>
                  <FormLabel htmlFor={`${row.id}-end`} fontSize="sm">结束时间</FormLabel>
                  <Input
                    id={`${row.id}-end`}
                    type="time"
                    step={60}
                    value={row.endTime}
                    onChange={(event) => updateRow(row.id, 'endTime', event.target.value)}
                    isDisabled={isApplying}
                  />
                  <Text minH="20px" mt={1} fontSize="xs" color={errorTextColor} visibility={endError ? 'visible' : 'hidden'}>
                    {endError || '无错误'}
                  </Text>
                </FormControl>

                <Tooltip label="删除科目" placement="top">
                  <IconButton
                    mt={8}
                    width="44px"
                    height="44px"
                    minW="44px"
                    variant="ghost"
                    colorScheme="red"
                    icon={<Trash2 size={20} />}
                    aria-label={`删除科目 ${index + 1}`}
                    onClick={() => deleteRow(row.id)}
                    isDisabled={isApplying}
                  />
                </Tooltip>
              </Grid>
            );
          })}
        </Flex>
      )}
    </Box>
  );
}
