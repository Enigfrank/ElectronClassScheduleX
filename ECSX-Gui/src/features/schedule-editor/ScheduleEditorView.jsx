import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Text,
  Textarea,
  useColorModeValue,
} from '@chakra-ui/react';
import {
  Download,
  FileInput,
  Plus,
  RefreshCw,
  Save,
  Upload,
} from 'lucide-react';
import {
  deepClone,
  detectSourceStructure,
  formatScheduleConfigError,
  generateScheduleConfigSource,
  normalizeScheduleConfig,
  normalizeScheduleConfigForEditor,
  normalizeTimeRange,
  parseScheduleConfigSource,
  sanitizeTypeName,
} from './configParser.mjs';
import {
  DeleteButton,
  EditorCard,
  ScheduleTypeEditor,
  SummaryCard,
} from './ScheduleEditorControls.jsx';
import {
  nextTimeRangeKey,
  parseClassItem,
  parseTypedValue,
  renameObjectKey,
  TAB_INDEX,
} from './scheduleEditorHelpers.mjs';

/**
 * ECSX GUI 内嵌课表配置编辑器
 * @param {{ipcRenderer: Electron.IpcRenderer}} props 组件属性
 * @returns {React.ReactElement} 课表配置编辑界面
 */
const ScheduleEditorView = ({ ipcRenderer }) => {
  const [config, setConfig] = useState(() => normalizeScheduleConfigForEditor({}));
  const [sourceStructure, setSourceStructure] = useState({ hasWeekDisplay: false });
  const [sourceText, setSourceText] = useState('');
  const [filePath, setFilePath] = useState('');
  const [status, setStatus] = useState({ type: 'info', message: '正在加载当前课表配置...' });
  const [isBusy, setIsBusy] = useState(false);
  const [tabIndex, setTabIndex] = useState(0);
  const [selectedTimetableType, setSelectedTimetableType] = useState('');
  const [selectedDividerType, setSelectedDividerType] = useState('');

  const mutedTextColor = useColorModeValue('gray.600', 'gray.400');
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const panelBg = useColorModeValue('gray.50', 'gray.900');

  const timetableTypes = useMemo(() => Object.keys(config.timetable || {}), [config.timetable]);
  const dividerTypes = useMemo(() => Object.keys(config.divider || {}), [config.divider]);

  /**
   * 使用配置源码刷新编辑器状态
   * @param {string} source JS 配置源码
   * @param {string} nextFilePath 配置来源路径
   * @returns {void}
   */
  const loadSourceIntoEditor = useCallback((source, nextFilePath = '') => {
    const parsed = parseScheduleConfigSource(source);
    const normalized = normalizeScheduleConfigForEditor(parsed);
    const structure = detectSourceStructure(parsed);

    setConfig(normalized);
    setSourceStructure(structure);
    setSourceText(generateScheduleConfigSource(normalized, structure));
    setFilePath(nextFilePath);
    setSelectedTimetableType(Object.keys(normalized.timetable || {})[0] || '');
    setSelectedDividerType(Object.keys(normalized.divider || {})[0] || '');
  }, []);

  /**
   * 从当前应用配置文件加载配置
   * @returns {Promise<void>} 加载完成后刷新编辑器
   */
  const loadCurrentConfig = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await ipcRenderer.invoke('read-schedule-config-source');
      if (!result.success) {
        setStatus({ type: 'error', message: formatScheduleConfigError(result.error, '读取当前配置失败') });
        return;
      }

      loadSourceIntoEditor(result.source, result.filePath);
      setStatus({ type: 'success', message: '已加载当前应用使用的课表配置' });
    } catch (error) {
      setStatus({ type: 'error', message: `读取当前配置失败: ${error.message}` });
    } finally {
      setIsBusy(false);
    }
  }, [ipcRenderer, loadSourceIntoEditor]);

  useEffect(() => {
    loadCurrentConfig();
  }, [loadCurrentConfig]);

  /**
   * 更新配置对象并同步源码预览
   * @param {(draft: Object) => void} updater 配置修改函数
   * @returns {void}
   */
  const updateConfig = (updater) => {
    setConfig((previous) => {
      const draft = deepClone(previous);
      updater(draft);
      const normalized = normalizeScheduleConfigForEditor(draft);
      setSourceText(generateScheduleConfigSource(normalized, sourceStructure));
      return normalized;
    });
  };

  /**
   * 保存当前编辑内容到应用正在使用的 scheduleConfig.js，并请求主课表窗口重新加载
   * @returns {Promise<void>} 保存和应用完成后更新状态
   */
  const saveCurrentConfig = async () => {
    setIsBusy(true);
    try {
      const normalized = normalizeScheduleConfig(config);
      const source = generateScheduleConfigSource(normalized, sourceStructure);
      const result = await ipcRenderer.invoke('save-schedule-config-source', source);

      if (!result.success) {
        setStatus({ type: 'error', message: formatScheduleConfigError(result.error, '保存失败，配置没有被覆盖') });
        return;
      }

      setSourceText(source);
      setFilePath(result.filePath || filePath);
      const applyResult = await ipcRenderer.invoke('apply-schedule-config');
      if (!applyResult.success) {
        setStatus({ type: 'error', message: formatScheduleConfigError(applyResult.error, '配置已保存，但应用失败') });
        return;
      }

      setStatus({ type: 'success', message: '已保存配置并重新应用到主课表' });
    } catch (error) {
      setStatus({ type: 'error', message: `保存失败: ${error.message}` });
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * 从外部 JS 文件导入配置到编辑器
   * @returns {Promise<void>} 导入完成后刷新编辑器
   */
  const importConfig = async () => {
    setIsBusy(true);
    try {
      const result = await ipcRenderer.invoke('import-schedule-config-source');
      if (result.canceled) return;
      if (!result.success) {
        setStatus({ type: 'error', message: formatScheduleConfigError(result.error, '导入失败') });
        return;
      }

      loadSourceIntoEditor(result.source, result.filePath);
      setStatus({ type: 'success', message: '配置已导入编辑器，保存后才会覆盖当前应用配置' });
    } catch (error) {
      setStatus({ type: 'error', message: `导入失败: ${error.message}` });
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * 导出当前编辑器配置到用户指定文件
   * @returns {Promise<void>} 导出完成后更新状态
   */
  const exportConfig = async () => {
    setIsBusy(true);
    try {
      const source = generateScheduleConfigSource(normalizeScheduleConfig(config), sourceStructure);
      const result = await ipcRenderer.invoke('export-schedule-config-source', source);
      if (result.canceled) return;
      setStatus(result.success
        ? { type: 'success', message: `已导出到 ${result.filePath}` }
        : { type: 'error', message: formatScheduleConfigError(result.error, '导出失败') });
    } catch (error) {
      setStatus({ type: 'error', message: `导出失败: ${error.message}` });
    } finally {
      setIsBusy(false);
    }
  };

  /**
   * 从源码预览文本重新解析配置
   * @returns {void}
   */
  const applySourceText = () => {
    try {
      loadSourceIntoEditor(sourceText, filePath);
      setStatus({ type: 'success', message: '源码已重新解析到表单' });
    } catch (error) {
      setStatus({ type: 'error', message: `源码解析失败: ${error.message}` });
    }
  };

  /**
   * 添加一个空科目映射
   * @returns {void}
   */
  const addSubject = () => {
    updateConfig((draft) => {
      let index = Object.keys(draft.subject_name).length + 1;
      let key = `科目${index}`;
      while (draft.subject_name[key]) {
        index += 1;
        key = `科目${index}`;
      }
      draft.subject_name[key] = '';
    });
  };

  /**
   * 重命名科目键
   * @param {string} oldKey 原科目简写
   * @param {string} nextKey 新科目简写
   * @returns {void}
   */
  const renameSubject = (oldKey, nextKey) => {
    updateConfig((draft) => {
      const key = nextKey.trim();
      if (!key || key === oldKey) return;
      const value = draft.subject_name[oldKey];
      delete draft.subject_name[oldKey];
      draft.subject_name[key] = value;
    });
  };

  /**
   * 添加新的时间表类型
   * @returns {void}
   */
  const addTimetableType = () => {
    updateConfig((draft) => {
      let index = timetableTypes.length + 1;
      let key = `type_${index}`;
      while (draft.timetable[key]) {
        index += 1;
        key = `type_${index}`;
      }
      draft.timetable[key] = {};
      setSelectedTimetableType(key);
    });
  };

  /**
   * 添加新的每日课表
   * @returns {void}
   */
  const addDailyClass = () => {
    updateConfig((draft) => {
      draft.daily_class.push({ Chinese: '', English: '', classList: [], timetable: selectedTimetableType || '' });
    });
  };

  /**
   * 添加新的分隔线类型
   * @returns {void}
   */
  const addDividerType = () => {
    updateConfig((draft) => {
      let index = dividerTypes.length + 1;
      let key = `divider_${index}`;
      while (draft.divider[key]) {
        index += 1;
        key = `divider_${index}`;
      }
      draft.divider[key] = [];
      setSelectedDividerType(key);
    });
  };

  return (
    <Box maxW="1280px">
      <Flex align="flex-start" justify="space-between" gap={4} mb={5} flexWrap="wrap">
        <Box>
          <Text fontSize="xl" fontWeight="semibold">课表配置编辑器(Beta)</Text>
          <Text fontSize="sm" color={mutedTextColor}>
            直接编辑当前应用使用的 scheduleConfig.js，支持导入和导出
          </Text>
          {filePath && <Text fontSize="xs" color={mutedTextColor} mt={1}>{filePath}</Text>}
        </Box>
        <HStack spacing={2} flexWrap="wrap">
          <Button leftIcon={<RefreshCw size={16} />} onClick={loadCurrentConfig} isLoading={isBusy} variant="outline">
            重新加载文件
          </Button>
          <Button leftIcon={<Upload size={16} />} onClick={importConfig} variant="outline">
            导入
          </Button>
          <Button leftIcon={<Download size={16} />} onClick={exportConfig} variant="outline">
            导出
          </Button>
          <Button leftIcon={<Save size={16} />} onClick={saveCurrentConfig} colorScheme="blue" isLoading={isBusy}>
            保存配置并应用
          </Button>
        </HStack>
      </Flex>

      {status.message && (
        <Alert status={status.type} borderRadius="md" mb={4}>
          <AlertIcon />
          <Box whiteSpace="pre-line">{status.message}</Box>
        </Alert>
      )}

      <SimpleGrid columns={[1, 2, 4]} gap={4} mb={5}>
        <SummaryCard label="科目映射" value={Object.keys(config.subject_name || {}).length} onClick={() => setTabIndex(TAB_INDEX.subjects)} />
        <SummaryCard label="时间表类型" value={timetableTypes.length} onClick={() => setTabIndex(TAB_INDEX.timetable)} />
        <SummaryCard label="每日课表" value={(config.daily_class || []).length} onClick={() => setTabIndex(TAB_INDEX.daily)} />
        <SummaryCard label="样式变量" value={Object.keys(config.css_style || {}).length} onClick={() => setTabIndex(TAB_INDEX.style)} />
      </SimpleGrid>

      <Tabs index={tabIndex} onChange={setTabIndex} colorScheme="blue" variant="enclosed">
        <TabList overflowX="auto">
          <Tab>基础设置</Tab>
          <Tab>科目名称</Tab>
          <Tab>时间表</Tab>
          <Tab>每日课表</Tab>
          <Tab>分隔线</Tab>
          <Tab>样式配置</Tab>
          <Tab>源码</Tab>
        </TabList>
        <TabPanels>
          <TabPanel px={0}>
            <EditorCard title="基础设置" desc="管理倒计时目标和星期显示">
              <SimpleGrid columns={[1, 2]} gap={4}>
                <FormControl>
                  <FormLabel>倒计时目标</FormLabel>
                  <Input value={config.countdown_target} onChange={(event) => updateConfig((draft) => { draft.countdown_target = event.target.value; })} placeholder="YYYY-MM-DD 或 hidden" />
                </FormControl>
                <FormControl display={sourceStructure.hasWeekDisplay ? 'block' : 'none'}>
                  <FormLabel>显示星期</FormLabel>
                  <Switch isChecked={config.week_display} onChange={(event) => updateConfig((draft) => { draft.week_display = event.target.checked; })} colorScheme="blue" />
                </FormControl>
              </SimpleGrid>
            </EditorCard>
          </TabPanel>

          <TabPanel px={0}>
            <EditorCard title="科目名称" desc="维护课程简称与完整名称的映射关系" action={<Button size="sm" leftIcon={<Plus size={16} />} onClick={addSubject}>添加科目</Button>}>
              <Flex direction="column" gap={3}>
                {Object.entries(config.subject_name || {}).map(([key, value]) => (
                  <SimpleGrid key={key} columns={[1, 1, 3]} gap={3} alignItems="center">
                    <Input defaultValue={key} onBlur={(event) => renameSubject(key, event.target.value)} placeholder="科目简写" />
                    <Input value={value} onChange={(event) => updateConfig((draft) => { draft.subject_name[key] = event.target.value; })} placeholder="科目全称" />
                    <DeleteButton label="删除科目" onClick={() => updateConfig((draft) => { delete draft.subject_name[key]; })} />
                  </SimpleGrid>
                ))}
              </Flex>
            </EditorCard>
          </TabPanel>

          <TabPanel px={0}>
            <EditorCard title="时间表" desc="配置不同类型日程的时间段与课程编号" action={<Button size="sm" leftIcon={<Plus size={16} />} onClick={addTimetableType}>添加类型</Button>}>
              <ScheduleTypeEditor
                selectedType={selectedTimetableType}
                types={timetableTypes}
                onSelect={setSelectedTimetableType}
                onRename={(oldType, nextType) => updateConfig((draft) => renameObjectKey(draft.timetable, oldType, sanitizeTypeName(nextType), setSelectedTimetableType))}
                onDelete={(type) => updateConfig((draft) => { delete draft.timetable[type]; setSelectedTimetableType(Object.keys(draft.timetable)[0] || ''); })}
              />
              {selectedTimetableType && (
                <Flex direction="column" gap={3} mt={4}>
                  {Object.entries(config.timetable[selectedTimetableType] || {}).map(([timeRange, content]) => (
                    <SimpleGrid key={timeRange} columns={[1, 1, 3]} gap={3} alignItems="center">
                      <Input defaultValue={timeRange} onBlur={(event) => updateConfig((draft) => renameObjectKey(draft.timetable[selectedTimetableType], timeRange, normalizeTimeRange(event.target.value), null))} placeholder="08:00-08:39" />
                      <Input value={String(content)} onChange={(event) => updateConfig((draft) => { draft.timetable[selectedTimetableType][timeRange] = parseTypedValue(event.target.value); })} placeholder="课程序号或文本" />
                      <DeleteButton label="删除时间段" onClick={() => updateConfig((draft) => { delete draft.timetable[selectedTimetableType][timeRange]; })} />
                    </SimpleGrid>
                  ))}
                  <Button size="sm" alignSelf="flex-start" leftIcon={<Plus size={16} />} onClick={() => updateConfig((draft) => { draft.timetable[selectedTimetableType][nextTimeRangeKey(draft.timetable[selectedTimetableType])] = 0; })}>
                    添加时间段
                  </Button>
                </Flex>
              )}
            </EditorCard>
          </TabPanel>

          <TabPanel px={0}>
            <EditorCard title="每日课表" desc="配置每天的名称、课程列表以及绑定的时间表类型" action={<Button size="sm" leftIcon={<Plus size={16} />} onClick={addDailyClass}>添加新天</Button>}>
              <Flex direction="column" gap={4}>
                {(config.daily_class || []).map((day, dayIndex) => (
                  <Card key={dayIndex} bg={panelBg} border="1px" borderColor={borderColor}>
                    <CardBody>
                      <Flex justify="space-between" gap={3} mb={4}>
                        <Text fontWeight="semibold">第 {dayIndex + 1} 天</Text>
                        <DeleteButton label="删除此天" onClick={() => updateConfig((draft) => { draft.daily_class.splice(dayIndex, 1); })} />
                      </Flex>
                      <SimpleGrid columns={[1, 3]} gap={3} mb={4}>
                        <Input value={day.Chinese} onChange={(event) => updateConfig((draft) => { draft.daily_class[dayIndex].Chinese = event.target.value; })} placeholder="中文名，如：一" />
                        <Input value={day.English} onChange={(event) => updateConfig((draft) => { draft.daily_class[dayIndex].English = event.target.value; })} placeholder="英文名，如：MON" />
                        <Select value={day.timetable} onChange={(event) => updateConfig((draft) => { draft.daily_class[dayIndex].timetable = event.target.value; })}>
                          <option value="">请选择时间表类型</option>
                          {timetableTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                        </Select>
                      </SimpleGrid>
                      <Flex direction="column" gap={2}>
                        {(day.classList || []).map((item, itemIndex) => (
                          <HStack key={itemIndex}>
                            <Input value={Array.isArray(item) ? item.join(',') : String(item)} onChange={(event) => updateConfig((draft) => { draft.daily_class[dayIndex].classList[itemIndex] = parseClassItem(event.target.value); })} placeholder="课程简称，轮换课用逗号分隔" />
                            <DeleteButton label="删除课程" onClick={() => updateConfig((draft) => { draft.daily_class[dayIndex].classList.splice(itemIndex, 1); })} />
                          </HStack>
                        ))}
                        <Button size="sm" alignSelf="flex-start" leftIcon={<Plus size={16} />} onClick={() => updateConfig((draft) => { draft.daily_class[dayIndex].classList.push(''); })}>
                          添加课程
                        </Button>
                      </Flex>
                    </CardBody>
                  </Card>
                ))}
              </Flex>
            </EditorCard>
          </TabPanel>

          <TabPanel px={0}>
            <EditorCard title="分隔线" desc="编辑不同日程类型下的分隔线课程序号" action={<Button size="sm" leftIcon={<Plus size={16} />} onClick={addDividerType}>添加类型</Button>}>
              <ScheduleTypeEditor
                selectedType={selectedDividerType}
                types={dividerTypes}
                onSelect={setSelectedDividerType}
                onRename={(oldType, nextType) => updateConfig((draft) => renameObjectKey(draft.divider, oldType, sanitizeTypeName(nextType), setSelectedDividerType))}
                onDelete={(type) => updateConfig((draft) => { delete draft.divider[type]; setSelectedDividerType(Object.keys(draft.divider)[0] || ''); })}
              />
              {selectedDividerType && (
                <HStack mt={4} align="flex-start" flexWrap="wrap">
                  {(config.divider[selectedDividerType] || []).map((value, index) => (
                    <HStack key={index}>
                      <Input type="number" w="120px" value={value} onChange={(event) => updateConfig((draft) => { draft.divider[selectedDividerType][index] = Number(event.target.value); })} />
                      <DeleteButton label="删除分隔线" onClick={() => updateConfig((draft) => { draft.divider[selectedDividerType].splice(index, 1); })} />
                    </HStack>
                  ))}
                  <Button size="sm" leftIcon={<Plus size={16} />} onClick={() => updateConfig((draft) => { draft.divider[selectedDividerType].push(0); })}>
                    添加分隔线
                  </Button>
                </HStack>
              )}
            </EditorCard>
          </TabPanel>

          <TabPanel px={0}>
            <EditorCard title="样式配置" desc="编辑导出配置内的 CSS 变量值">
              <Flex direction="column" gap={3}>
                {Object.entries(config.css_style || {}).map(([key, value]) => (
                  <SimpleGrid key={key} columns={[1, 2]} gap={3}>
                    <Input value={key} isReadOnly />
                    <Input value={value} onChange={(event) => updateConfig((draft) => { draft.css_style[key] = event.target.value; })} />
                  </SimpleGrid>
                ))}
              </Flex>
            </EditorCard>
          </TabPanel>

          <TabPanel px={0}>
            <EditorCard title="源码" desc="查看或粘贴 scheduleConfig.js 源码">
              <Textarea minH="460px" fontFamily="monospace" value={sourceText} onChange={(event) => setSourceText(event.target.value)} />
              <Button mt={3} leftIcon={<FileInput size={16} />} onClick={applySourceText}>从源码重新解析到表单</Button>
            </EditorCard>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
};

export default ScheduleEditorView;
