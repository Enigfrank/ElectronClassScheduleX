import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Progress,
  Select,
  SimpleGrid,
  Switch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  Tooltip,
  useColorModeValue
} from '@chakra-ui/react';
import { Download, DownloadCloud, Gauge, RefreshCw, RotateCw } from 'lucide-react';

const EMPTY_STATUS = {
  state: 'idle',
  message: '未检查更新',
  currentVersion: '',
  latestVersion: '',
  sourceId: '',
  error: '',
  progress: null
};

/**
 * 根据更新状态返回对应的徽标配色。
 * @param {string} state 更新状态
 * @returns {string} Chakra UI 颜色方案
 */
function getStatusColorScheme(state) {
  if (state === 'available' || state === 'downloaded') {
    return 'green';
  }

  if (state === 'checking' || state === 'downloading') {
    return 'blue';
  }

  if (state === 'error') {
    return 'red';
  }

  return 'gray';
}

/**
 * 将更新源列表补全为可供界面展示的选项。
 * @param {Array<object>} sources 后端返回的更新源列表
 * @returns {Array<object>} 可用于下拉框的更新源列表
 */
function buildSourceOptions(sources = []) {
  const normalizedSources = Array.isArray(sources) ? [...sources] : [];
  const hasCustomOption = normalizedSources.some((source) => source.id === 'custom');

  if (!hasCustomOption) {
    normalizedSources.push({
      id: 'custom',
      name: '自定义代理',
      prefix: '',
      isProxy: true
    });
  }

  return normalizedSources;
}

/**
 * 根据当前设置与状态计算界面展示的更新源名称。
 * @param {object} settings 更新设置
 * @param {object} status 当前更新状态
 * @param {Array<object>} sourceOptions 可选更新源
 * @returns {string} 当前更新源展示文案
 */
function getCurrentSourceLabel(settings, status, sourceOptions) {
  if (!settings.useUpdateProxy) {
    return 'GitHub 官方源';
  }

  const activeSourceId = status.sourceId || settings.updateProxyId || 'github';
  const matchedSource = sourceOptions.find((source) => source.id === activeSourceId);
  return matchedSource?.name || activeSourceId;
}

/**
 * 在线更新管理页面。
 * @param {{ipcRenderer: Electron.IpcRenderer}} props 组件属性
 * @returns {JSX.Element} 在线更新页面
 */
function UpdateManagerView({ ipcRenderer }) {
  const mutedTextColor = useColorModeValue('gray.500', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const cardBg = useColorModeValue('white', 'gray.800');
  const progressTrackColor = useColorModeValue('gray.100', 'gray.700');
  const [settings, setSettings] = useState({
    autoCheckUpdates: true,
    useUpdateProxy: true,
    updateProxyId: 'gh-proxy-v4',
    customUpdateProxyPrefix: '',
    sources: []
  });
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [probeResults, setProbeResults] = useState([]);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [settingsError, setSettingsError] = useState('');

  const sourceOptions = useMemo(() => buildSourceOptions(settings.sources), [settings.sources]);
  const currentSourceLabel = useMemo(
    () => getCurrentSourceLabel(settings, status, sourceOptions),
    [settings, status, sourceOptions]
  );

  /**
   * 将后端返回的设置合并到本地状态。
   * @param {object} nextSettings 更新设置
   */
  const applySettings = useCallback((nextSettings = {}) => {
    setSettings((prev) => ({
      ...prev,
      ...nextSettings,
      sources: Array.isArray(nextSettings.sources) ? nextSettings.sources : prev.sources
    }));
  }, []);

  useEffect(() => {
    let mounted = true;

    /**
     * 加载初始化所需的更新设置和状态。
     * @returns {Promise<void>} 初始化结果
     */
    async function loadInitialState() {
      const [loadedSettings, loadedStatus] = await Promise.all([
        ipcRenderer.invoke('get-update-settings'),
        ipcRenderer.invoke('get-update-status')
      ]);

      if (!mounted) {
        return;
      }

      applySettings(loadedSettings || {});
      setStatus(loadedStatus || EMPTY_STATUS);
    }

    /**
     * 同步主进程推送的更新状态。
     * @param {Electron.IpcRendererEvent} _event IPC 事件
     * @param {object} nextStatus 最新更新状态
     */
    function handleStatusChanged(_event, nextStatus) {
      setStatus(nextStatus || EMPTY_STATUS);
      if (nextStatus?.state !== 'downloading') {
        setIsDownloading(false);
      }
      if (nextStatus?.state !== 'downloaded') {
        setIsInstalling(false);
      }
    }

    loadInitialState().catch((error) => {
      if (!mounted) {
        return;
      }

      setStatus({
        ...EMPTY_STATUS,
        state: 'error',
        message: '读取更新状态失败',
        error: error instanceof Error ? error.message : String(error)
      });
    });

    const unsubscribe = ipcRenderer.on('update-status-changed', handleStatusChanged);

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [applySettings, ipcRenderer]);

  /**
   * 保存更新设置并处理失败提示。
   * @param {object} patch 设置增量
   * @returns {Promise<void>} 保存结果
   */
  const saveSettings = useCallback(async (patch) => {
    try {
      const nextSettings = await ipcRenderer.invoke('set-update-settings', patch);
      applySettings({ ...patch, ...(nextSettings || {}) });
      setSettingsError('');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setSettingsError(errorMessage);
    }
  }, [applySettings, ipcRenderer]);

  /**
   * 手动检查更新。
   * @returns {Promise<void>} 检查结果
   */
  const handleCheckForUpdates = useCallback(async () => {
    setIsChecking(true);
    try {
      await ipcRenderer.invoke('check-for-updates');
    } catch (error) {
      setStatus({
        ...EMPTY_STATUS,
        state: 'error',
        message: '检查更新失败',
        error: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsChecking(false);
    }
  }, [ipcRenderer]);

  /**
   * 下载可用更新。
   * @returns {Promise<void>} 下载结果
   */
  const handleDownloadUpdate = useCallback(async () => {
    setIsDownloading(true);
    try {
      await ipcRenderer.invoke('download-update');
    } catch (error) {
      setIsDownloading(false);
      setStatus((prev) => ({
        ...prev,
        state: 'error',
        message: '下载更新失败',
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }, [ipcRenderer]);

  /**
   * 立即重启并安装更新。
   * @returns {Promise<void>} 安装结果
   */
  const handleInstallUpdate = useCallback(async () => {
    setIsInstalling(true);
    try {
      await ipcRenderer.invoke('install-update');
    } catch (error) {
      setIsInstalling(false);
      setStatus((prev) => ({
        ...prev,
        state: 'error',
        message: '启动安装失败',
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }, [ipcRenderer]);

  /**
   * 对所有更新源执行测速。
   * @returns {Promise<void>} 测速结果
   */
  const handleTestSources = useCallback(async () => {
    setIsTesting(true);
    try {
      const results = await ipcRenderer.invoke('test-update-sources');
      setProbeResults(Array.isArray(results) ? results : []);
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        state: 'error',
        message: '代理测速失败',
        error: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      setIsTesting(false);
    }
  }, [ipcRenderer]);

  /**
   * 根据测速结果一键切换更新源。
   * @param {string} sourceId 更新源标识
   * @returns {Promise<void>} 切换结果
   */
  const handleUseProbeSource = useCallback(async (sourceId) => {
    const nextUseUpdateProxy = sourceId !== 'github';
    await saveSettings({
      updateProxyId: sourceId,
      useUpdateProxy: nextUseUpdateProxy
    });
  }, [saveSettings]);

  return (
    <>
      <SimpleGrid columns={[1, 2, 4]} gap={4} mb={6}>
        <Card bg={cardBg}>
          <CardBody>
            <Text fontSize="sm" color={mutedTextColor}>当前版本</Text>
            <Text fontSize="xl" fontWeight="semibold" mt={1}>{status.currentVersion || '-'}</Text>
          </CardBody>
        </Card>
        <Card bg={cardBg}>
          <CardBody>
            <Text fontSize="sm" color={mutedTextColor}>最新版本</Text>
            <Text fontSize="xl" fontWeight="semibold" mt={1}>{status.latestVersion || '-'}</Text>
          </CardBody>
        </Card>
        <Card bg={cardBg}>
          <CardBody>
            <Text fontSize="sm" color={mutedTextColor}>更新状态</Text>
            <Badge mt={2} colorScheme={getStatusColorScheme(status.state)}>{status.message}</Badge>
          </CardBody>
        </Card>
        <Card bg={cardBg}>
          <CardBody>
            <Text fontSize="sm" color={mutedTextColor}>当前更新源</Text>
            <Text fontSize="xl" fontWeight="semibold" mt={1}>{currentSourceLabel}</Text>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Card mb={6} bg={cardBg}>
        <CardBody>
          <Flex gap={3} flexWrap="wrap">
            <Tooltip label="检查 GitHub Releases 是否存在新版本" placement="bottom">
              <Button
                leftIcon={<RefreshCw size={16} />}
                isLoading={isChecking}
                loadingText="检查中"
                onClick={handleCheckForUpdates}
              >
                检查更新
              </Button>
            </Tooltip>
            <Button
              leftIcon={<Download size={16} />}
              isLoading={isDownloading}
              loadingText="下载中"
              isDisabled={status.state !== 'available' && status.state !== 'downloading'}
              onClick={handleDownloadUpdate}
            >
              下载更新
            </Button>
            <Button
              leftIcon={<RotateCw size={16} />}
              isLoading={isInstalling}
              loadingText="准备安装"
              isDisabled={status.state !== 'downloaded'}
              onClick={handleInstallUpdate}
            >
              立即重启安装
            </Button>
            <Button
              leftIcon={<Gauge size={16} />}
              variant="outline"
              isLoading={isTesting}
              loadingText="测速中"
              onClick={handleTestSources}
            >
              代理测速
            </Button>
          </Flex>

          {status.progress ? (
            <Box mt={4}>
              <Flex align="center" gap={3}>
                <Progress
                  value={status.progress.percent}
                  size="sm"
                  borderRadius="md"
                  bg={progressTrackColor}
                  flex={1}
                />
                <Text fontSize="sm" fontWeight="medium" color={mutedTextColor} minW="48px" textAlign="right">
                  {status.progress.percent}%
                </Text>
              </Flex>
              <Text mt={2} fontSize="sm" color={mutedTextColor}>
                {status.progress.transferredText} / {status.progress.totalText} · {status.progress.speedText}
              </Text>
              <Text mt={1} fontSize="xs" color="gray.400">
                全量安装包，非差分更新
              </Text>
            </Box>
          ) : null}

          {status.error ? (
            <Text mt={3} fontSize="sm" color="red.500">{status.error}</Text>
          ) : null}
        </CardBody>
      </Card>

      <Card mb={6} bg={cardBg}>
        <CardBody>
          <Flex align="center" gap={2} mb={4}>
            <DownloadCloud size={18} />
            <Text fontSize="lg" fontWeight="medium">更新设置</Text>
          </Flex>

          <Flex direction="column" gap={4}>
            <Flex
              align="center"
              justify="space-between"
              gap={4}
              pb={4}
              borderBottom="1px"
              borderColor={borderColor}
            >
              <Box>
                <Text fontWeight="semibold">启动后自动检查更新</Text>
                <Text fontSize="sm" color={mutedTextColor}>应用启动后后台检查一次，不会自动下载更新</Text>
              </Box>
              <Switch
                colorScheme="blue"
                isChecked={settings.autoCheckUpdates}
                onChange={(event) => saveSettings({ autoCheckUpdates: event.target.checked })}
              />
            </Flex>

            <Flex
              align="center"
              justify="space-between"
              gap={4}
              pb={4}
              borderBottom="1px"
              borderColor={borderColor}
            >
              <Box>
                <Text fontWeight="semibold">使用代理源</Text>
                <Text fontSize="sm" color={mutedTextColor}>关闭后将直接访问 GitHub 官方发布地址</Text>
              </Box>
              <Switch
                colorScheme="blue"
                isChecked={settings.useUpdateProxy}
                onChange={(event) => saveSettings({ useUpdateProxy: event.target.checked })}
              />
            </Flex>

            <FormControl isDisabled={!settings.useUpdateProxy}>
              <FormLabel>代理源选择</FormLabel>
              <Select
                value={settings.updateProxyId}
                onChange={(event) => saveSettings({ updateProxyId: event.target.value })}
              >
                {sourceOptions.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </Select>
              <FormHelperText color={mutedTextColor}>推荐先测速，再选择延迟更低的代理源。</FormHelperText>
            </FormControl>

            <FormControl isDisabled={!settings.useUpdateProxy}>
              <FormLabel>自定义代理输入</FormLabel>
              <Input
                value={settings.customUpdateProxyPrefix || ''}
                placeholder="https://example.com/"
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSettings((prev) => ({
                    ...prev,
                    customUpdateProxyPrefix: nextValue
                  }));
                }}
                onBlur={() => saveSettings({ customUpdateProxyPrefix: settings.customUpdateProxyPrefix })}
              />
              <FormHelperText color={mutedTextColor}>
                仅支持 HTTPS 前缀，例如 `https://v4.gh-proxy.org/`。
              </FormHelperText>
            </FormControl>

            {settingsError ? (
              <Text fontSize="sm" color="red.500">{settingsError}</Text>
            ) : null}
          </Flex>
        </CardBody>
      </Card>

      <Card bg={cardBg}>
        <CardBody>
          <Flex align="center" justify="space-between" gap={3} mb={4} flexWrap="wrap">
            <Text fontSize="lg" fontWeight="medium">代理测速结果</Text>
            <Text fontSize="sm" color={mutedTextColor}>按照可用性和总耗时排序</Text>
          </Flex>

          {probeResults.length > 0 ? (
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>源</Th>
                  <Th>状态</Th>
                  <Th>首字节</Th>
                  <Th>总耗时</Th>
                  <Th>操作</Th>
                </Tr>
              </Thead>
              <Tbody>
                {probeResults.map((result) => (
                  <Tr key={result.id}>
                    <Td>{result.name}</Td>
                    <Td>
                      <Badge colorScheme={result.available ? 'green' : 'red'}>
                        {result.available ? '可用' : '不可用'}
                      </Badge>
                    </Td>
                    <Td>{result.firstByteMs == null ? '-' : `${result.firstByteMs} ms`}</Td>
                    <Td>{result.totalMs == null ? '-' : `${result.totalMs} ms`}</Td>
                    <Td>
                      <Button
                        size="xs"
                        variant="outline"
                        isDisabled={!result.available}
                        onClick={() => handleUseProbeSource(result.id)}
                      >
                        使用此源
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : (
            <Text fontSize="sm" color={mutedTextColor}>点击“代理测速”后在这里查看各更新源的延迟结果。</Text>
          )}
        </CardBody>
      </Card>
    </>
  );
}

export default UpdateManagerView;
