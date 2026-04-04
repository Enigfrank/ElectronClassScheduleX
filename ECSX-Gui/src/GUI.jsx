import React, { useState, useEffect, useRef } from 'react';
import './GUI.css';
import {
  Box,
  Flex,
  Text,
  Heading,
  Button,
  Switch,
  Card,
  CardBody,
  SimpleGrid,
  VStack,
  Divider,
  Badge,
  Input,
  Select,
  Spinner,
  Tooltip,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useColorMode,
  useColorModeValue,
  ChakraProvider,
  extendTheme,
} from '@chakra-ui/react';
import {
  Calendar,
  Settings,
  Wrench,
  Clock,
  RefreshCw,
  Timer,
  Pin,
  EyeOff,
  Rocket,
  Power,
  RotateCcw,
  Info,
  X,
  Plus,
  MoreHorizontal,
  Sun,
  Moon,
  Globe,
  BookOpen,
  Wifi,
  Lock,
  Save,
  FolderOpen,
} from 'lucide-react';

const { ipcRenderer } = window.require('electron');

const theme = extendTheme({
  colors: {
    brand: {
      50: '#e6f2ff',
      100: '#b3d9ff',
      200: '#80bfff',
      300: '#4da6ff',
      400: '#1a8cff',
      500: '#0073e6',
      600: '#005bb3',
      700: '#004280',
      800: '#002a4d',
      900: '#00111a',
    },
  },
  fonts: {
    heading: 'Segoe UI, system-ui, sans-serif',
    body: 'Segoe UI, system-ui, sans-serif',
  },
});

const QuickActions = ({ mutedTextColor }) => {
  return (
    <Flex gap={3} mt={6} flexWrap="wrap">
      <Tooltip label="打开官方文档" placement="bottom">
        <Button
          colorScheme="blue"
          onClick={() => ipcRenderer.send('open-external-link', 'https://doc.cavendi.top/')}
          leftIcon={<Globe size={18} />}
        >
          官方文档
        </Button>
      </Tooltip>
      <Tooltip label="打开课表配置文件夹进行编辑" placement="bottom">
        <Button onClick={() => ipcRenderer.send('open-config-folder')} leftIcon={<Calendar size={18} />}>
          编辑课表
        </Button>
      </Tooltip>
      <Tooltip label="分享课表" placement="bottom">
        <Button isDisabled leftIcon={<RefreshCw size={18} />}>
          同步课表(TODO)
        </Button>
      </Tooltip>
      <Menu>
        <MenuButton as={Button} variant="outline" leftIcon={<MoreHorizontal size={18} />}>
          更多
        </MenuButton>
        <MenuList>
          <MenuItem isDisabled>导入课表(TODO)</MenuItem>
          <MenuItem isDisabled>高级设置(TODO)</MenuItem>
          <Divider />
          <MenuItem isDisabled>关于(TODO)</MenuItem>
        </MenuList>
      </Menu>
    </Flex>
  );
};

const ToolsBar = ({ handleButtonClick, useColorModeValue }) => {
  return (
    <SimpleGrid columns={[1, 2, 4]} gap={4} mt={4}>
      <Card
        cursor="pointer"
        onClick={() => handleButtonClick('devTools')}
        bg={useColorModeValue('orange.100', 'orange.900')}
        _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
        transition="all 0.2s ease"
      >
        <CardBody>
          <Flex align="center" gap={2} fontWeight="semibold">
            <Wrench size={18} />
            开发者工具
          </Flex>
          <Text fontSize="sm" color={useColorModeValue('gray.500', 'gray.400')} mt={1}>
            打开开发者调试工具
          </Text>
        </CardBody>
      </Card>

      <Card
        cursor="pointer"
        onClick={() => handleButtonClick('resetSettings')}
        bg={useColorModeValue('red.100', 'red.900')}
        _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
        transition="all 0.2s ease"
      >
        <CardBody>
          <Flex align="center" gap={2} fontWeight="semibold">
            <RotateCcw size={18} />
            重置设置
          </Flex>
          <Text fontSize="sm" color={useColorModeValue('gray.500', 'gray.400')} mt={1}>
            恢复默认设置
          </Text>
        </CardBody>
      </Card>

      <Card
        cursor="pointer"
        onClick={() => handleButtonClick('moreInfo')}
        bg={useColorModeValue('blue.100', 'blue.900')}
        _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
        transition="all 0.2s ease"
      >
        <CardBody>
          <Flex align="center" gap={2} fontWeight="semibold">
            <Info size={18} />
            更多信息
          </Flex>
          <Text fontSize="sm" color={useColorModeValue('gray.500', 'gray.400')} mt={1}>
            查看应用信息
          </Text>
        </CardBody>
      </Card>

      <Card
        cursor="pointer"
        onClick={() => handleButtonClick('quitApp')}
        bg="gray.700"
        color="white"
        _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
        transition="all 0.2s ease"
      >
        <CardBody>
          <Flex align="center" gap={2} fontWeight="semibold">
            <X size={18} />
            退出程序
          </Flex>
          <Text fontSize="sm" color="gray.300" mt={1}>
            关闭应用
          </Text>
        </CardBody>
      </Card>
    </SimpleGrid>
  );
};

const ExtensionPlaceholder = ({ cardBg, borderColor, mutedTextColor }) => {
  return (
    <Box
      mt={8}
      p={6}
      bg={cardBg}
      borderRadius="xl"
      border="2px dashed"
      borderColor={borderColor}
      textAlign="center"
    >
      <Text fontWeight="semibold" fontSize="lg" color={mutedTextColor}>
        扩展功能区域(TODO)
      </Text>
      <Text fontSize="sm" color={mutedTextColor} mt={2} display="block">
        插件、小组件和其他扩展将在这里显示
      </Text>
      <Box mt={4}>
        <Button variant="outline" size="sm" leftIcon={<Plus size={16} />} isDisabled>
          添加扩展(TODO)
        </Button>
      </Box>
    </Box>
  );
};

const MainView = ({ handleButtonClick, mutedTextColor, cardBg, borderColor, useColorModeValue }) => {
  return (
    <>
      <Text fontSize="xl" fontWeight="semibold" mb={4}>功能选项</Text>
      <SimpleGrid columns={[1, 2, 3]} gap={5} maxW="1200px">
        <Card
          cursor="pointer"
          onClick={() => handleButtonClick('week1')}
          minH="140px"
          _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
          transition="all 0.2s ease"
        >
          <Box bg="blue.500" h="80px" display="flex" alignItems="center" justifyContent="center" borderTopRadius="md">
            <Calendar size={40} color="white" />
          </Box>
          <CardBody>
            <Text fontWeight="semibold">单周</Text>
            <Text fontSize="sm" color={mutedTextColor}>切换到单周课程表</Text>
          </CardBody>
        </Card>

        <Card
          cursor="pointer"
          onClick={() => handleButtonClick('week2')}
          minH="140px"
          _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
          transition="all 0.2s ease"
        >
          <Box bg="blue.500" h="80px" display="flex" alignItems="center" justifyContent="center" borderTopRadius="md">
            <Calendar size={40} color="white" />
          </Box>
          <CardBody>
            <Text fontWeight="semibold">双周</Text>
            <Text fontSize="sm" color={mutedTextColor}>切换到双周课程表</Text>
          </CardBody>
        </Card>

        <Card
          cursor="pointer"
          onClick={() => handleButtonClick('openSetting')}
          minH="140px"
          _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
          transition="all 0.2s ease"
        >
          <Box bg="blue.500" h="80px" display="flex" alignItems="center" justifyContent="center" borderTopRadius="md">
            <Settings size={40} color="white" />
          </Box>
          <CardBody>
            <Text fontWeight="semibold">配置课表</Text>
            <Text fontSize="sm" color={mutedTextColor}>临时调整课程信息</Text>
          </CardBody>
        </Card>

        <Card
          cursor="pointer"
          onClick={() => handleButtonClick('correctTime')}
          minH="140px"
          _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
          transition="all 0.2s ease"
        >
          <Box bg="blue.500" h="80px" display="flex" alignItems="center" justifyContent="center" borderTopRadius="md">
            <Clock size={40} color="white" />
          </Box>
          <CardBody>
            <Text fontWeight="semibold">矫正计时</Text>
            <Text fontSize="sm" color={mutedTextColor}>校准系统时间偏移</Text>
          </CardBody>
        </Card>

        <Card
          cursor="pointer"
          onClick={() => handleButtonClick('toggleSchedule')}
          minH="140px"
          _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
          transition="all 0.2s ease"
        >
          <Box bg="blue.500" h="80px" display="flex" alignItems="center" justifyContent="center" borderTopRadius="md">
            <RefreshCw size={40} color="white" />
          </Box>
          <CardBody>
            <Text fontWeight="semibold">切换日程</Text>
            <Text fontSize="sm" color={mutedTextColor}>调休适用.....</Text>
          </CardBody>
        </Card>

        <Card
          cursor="pointer"
          onClick={() => handleButtonClick('manageShutdown')}
          minH="140px"
          _hover={{ transform: 'translateY(-2px)', shadow: 'xl' }}
          transition="all 0.2s ease"
        >
          <Box bg="blue.500" h="80px" display="flex" alignItems="center" justifyContent="center" borderTopRadius="md">
            <Power size={40} color="white" />
          </Box>
          <CardBody>
            <Text fontWeight="semibold">管理定时关机</Text>
            <Text fontSize="sm" color={mutedTextColor}>设置自动关机时间</Text>
          </CardBody>
        </Card>
      </SimpleGrid>

      <QuickActions mutedTextColor={mutedTextColor} />
      <ToolsBar handleButtonClick={handleButtonClick} useColorModeValue={useColorModeValue} />
      <ExtensionPlaceholder cardBg={cardBg} borderColor={borderColor} mutedTextColor={mutedTextColor} />
    </>
  );
};

const SettingsView = ({ settings, handleSettingChange, mutedTextColor, borderColor }) => {
  const settingItems = [
    { id: 'isDuringClassCountdown', icon: <Timer size={20} />, label: '课上计时', desc: '在课程进行中显示倒计时' },
    { id: 'isWindowAlwaysOnTop', icon: <Pin size={20} />, label: '窗口置顶', desc: '保持窗口始终在最前端' },
    { id: 'isDuringClassHidden', icon: <EyeOff size={20} />, label: '上课隐藏', desc: '上课期间自动隐藏窗口' },
    { id: 'isAutoLaunch', icon: <Rocket size={20} />, label: '开机启动', desc: '系统启动时自动运行' },
    { id: 'scheduleShutdown', icon: <Power size={20} />, label: '定时关机', desc: '启用自动关机功能' },
  ];

  return (
    <>
      <Text fontSize="xl" fontWeight="semibold" mb={4}>设置选项</Text>
      <Card>
        <CardBody>
          {settingItems.map((item, index) => (
            <Flex
              key={item.id}
              align="center"
              justify="space-between"
              py={4}
              borderBottom={index < settingItems.length - 1 ? '1px' : 'none'}
              borderColor={borderColor}
            >
              <Flex align="center" gap={3}>
                {item.icon}
                <Box>
                  <Text fontWeight="semibold">{item.label}</Text>
                  <Text fontSize="sm" color={mutedTextColor} display="block">
                    {item.desc}
                  </Text>
                </Box>
              </Flex>
              <Switch
                isChecked={settings[item.id]}
                onChange={() => handleSettingChange(item.id)}
                colorScheme="blue"
              />
            </Flex>
          ))}
        </CardBody>
      </Card>

      <Text fontSize="xl" fontWeight="semibold" mt={6} mb={4}>高级设置</Text>
      <Card>
        <CardBody>
          <Flex align="center" justify="space-between" py={4} borderBottom="1px" borderColor={borderColor}>
            <Flex align="center" gap={3}>
              <Settings size={20} />
              <Box>
                <Text fontWeight="semibold">重新运行引导</Text>
                <Text fontSize="sm" color={mutedTextColor} display="block">
                  重新打开OOBE初始设置向导
                </Text>
              </Box>
            </Flex>
            <Button size="sm" variant="outline" onClick={() => ipcRenderer.send('open-oobe')}>运行</Button>
          </Flex>
          <Flex align="center" justify="space-between" py={4} borderBottom="1px" borderColor={borderColor}>
            <Flex align="center" gap={3}>
              <Settings size={20} />
              <Box>
                <Text fontWeight="semibold">主题设置(TODO)</Text>
                <Text fontSize="sm" color={mutedTextColor} display="block">
                  自定义界面外观
                </Text>
              </Box>
            </Flex>
            <Button size="sm" variant="outline">配置</Button>
          </Flex>
          <Flex align="center" justify="space-between" py={4}>
            <Flex align="center" gap={3}>
              <Clock size={20} />
              <Box>
                <Text fontWeight="semibold">通知设置(TODO)</Text>
                <Text fontSize="sm" color={mutedTextColor} display="block">
                  管理提醒和通知
                </Text>
              </Box>
            </Flex>
            <Button size="sm" variant="outline">配置</Button>
          </Flex>
        </CardBody>
      </Card>
    </>
  );
};

const ToolsView = ({
  useColorModeValue,
  logs,
  isLoadingLogs,
  loadLogs,
  openLogsFolder
}) => {
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const textMuted = useColorModeValue('gray.600', 'gray.400');

  return (
    <>
      <Text fontSize="xl" fontWeight="semibold" mt={6} mb={4}>系统诊断</Text>
      <Card>
        <CardBody>
          <Text fontSize="lg" fontWeight="medium" mb={3}>应用运行日志</Text>

          {logs.length === 0 && !isLoadingLogs ? (
            <Text color={textMuted} fontSize="sm">
              暂无日志内容，点击"加载日志"按钮查看最新日志
            </Text>
          ) : (
            <Box
              h="300px"
              maxH="300px"
              overflowY="auto"
              p={3}
              bg={useColorModeValue('gray.50', 'gray.900')}
              borderRadius="md"
              border="1px"
              borderColor={borderColor}
              fontSize="sm"
              fontFamily="monospace"
              display="flex"
              flexDirection="column"
            >
              {isLoadingLogs ? (
                <Text color={textMuted}>正在加载日志...</Text>
              ) : (
                logs.map((log, index) => (
                  <Text key={index} fontSize="xs" mb={1}>
                    {log}
                  </Text>
                ))
              )}
            </Box>
          )}

          <Box mt={4} display="flex" gap={2}>
            <Button
              leftIcon={<Wrench size={16} />}
              onClick={loadLogs}
              isLoading={isLoadingLogs}
              loadingText="加载中..."
            >
              加载日志
            </Button>
            <Button
              leftIcon={<FolderOpen size={16} />}
              onClick={openLogsFolder}
              variant="outline"
            >
              打开日志文件夹
            </Button>
          </Box>
        </CardBody>
      </Card>
    </>
  );
};

const AssignmentView = ({
  assignmentSettings,
  wsStatus,
  isTestingConnection,
  isSaving,
  isRegistering,
  getConnectionStatusColor,
  getConnectionStatusText,
  useColorModeValue,
  mutedTextColor,
  serverUrlRef,
  clientNameRef,
  customTimeRef,
  handleAssignmentSettingChange,
  handleTestConnection,
  handleSaveAssignmentConfig,
  handleRegisterClient
}) => {
  return (
    <>
      <Text fontSize="xl" fontWeight="semibold" mb={4}>作业设置</Text>
      <Card>
        <CardBody>
          <Flex align="center" justify="space-between" py={4}>
            <Flex align="center" gap={3}>
              <BookOpen size={20} />
              <Box>
                <Text fontWeight="semibold">启用作业功能</Text>
                <Text fontSize="sm" color={mutedTextColor} display="block">
                  开启后将会从服务器获取作业信息
                </Text>
              </Box>
            </Flex>
            <Switch
              isChecked={assignmentSettings.enabled}
              onChange={(e) => {
                handleAssignmentSettingChange('enabled', e.target.checked);
                ipcRenderer.send('setAssignmentEnabled', e.target.checked);
              }}
              colorScheme="blue"
            />
          </Flex>
        </CardBody>
      </Card>

      <Text fontSize="xl" fontWeight="semibold" mt={6} mb={4}>服务器配置</Text>
      <Card>
        <CardBody>
          <VStack gap={4} align="stretch">
            <Box>
              <Text fontWeight="medium" mb={2}>服务器地址 *</Text>
              <Input
                placeholder="ws://example.com:8080"
                ref={serverUrlRef}
                defaultValue={assignmentSettings.serverUrl}
                isDisabled={!assignmentSettings.enabled}
              />
            </Box>

            <Box>
              <Text fontWeight="medium" mb={2}>客户端名称 *</Text>
              <Input
                placeholder="输入客户端名称"
                ref={clientNameRef}
                defaultValue={assignmentSettings.clientName}
                isDisabled={!assignmentSettings.enabled}
              />
            </Box>

            <Box>
              <Text fontWeight="medium" mb={2}>客户端ID</Text>
              <Flex align="center" gap={2}>
                <Input
                  flex={1}
                  value={assignmentSettings.clientId}
                  readOnly
                  isDisabled
                />
                <Lock size={20} color={mutedTextColor} />
              </Flex>
              <Text fontSize="sm" color={mutedTextColor} mt={1}>
                客户端ID由系统自动生成
              </Text>
            </Box>
          </VStack>

          <Flex
            align="center"
            gap={3}
            p={3}
            mt={4}
            borderRadius="md"
            bg={useColorModeValue('gray.100', 'gray.700')}
            sx={{
              ...(wsStatus === 'connected' && {
                bg: '#dcfce7 !important',
                border: '1px solid #86efac',
              }),
            }}
          >
            <Wifi size={18} />
            <Text fontWeight="semibold">连接状态：</Text>
            <Badge colorScheme={getConnectionStatusColor(wsStatus)}>
              {getConnectionStatusText(wsStatus)}
            </Badge>
            {wsStatus === 'connecting' && <Spinner size="sm" />}
          </Flex>

          <Box mt={4}>
            <Button
              variant="outline"
              onClick={() => {
                const serverUrl = serverUrlRef.current.value;
                handleAssignmentSettingChange('serverUrl', serverUrl);
                handleTestConnection();
              }}
              isDisabled={!assignmentSettings.enabled || !serverUrlRef.current?.value || isTestingConnection}
            >
              {isTestingConnection ? '测试中...' : '测试连接'}
            </Button>
            <Button
              variant="outline"
              ml={3}
              onClick={handleRegisterClient}
              isDisabled={!assignmentSettings.enabled || assignmentSettings.clientId || !clientNameRef.current?.value || isRegistering}
              colorScheme={assignmentSettings.clientId ? 'gray' : 'blue'}
            >
              {isRegistering ? '注册中...' : assignmentSettings.clientId ? '已注册' : '注册客户端'}
            </Button>
          </Box>
        </CardBody>
      </Card>

      <Text fontSize="xl" fontWeight="semibold" mt={6} mb={4}>显示设置</Text>
      <Card>
        <CardBody>
          <VStack gap={4} align="stretch">
            <Box>
              <Text fontWeight="medium" mb={2}>作业显示时机</Text>
              <Select
                value={assignmentSettings.displayTiming}
                onChange={(e) => handleAssignmentSettingChange('displayTiming', e.target.value)}
                isDisabled={!assignmentSettings.enabled}
              >
                <option value="afterAllClasses">当天所有课程结束后</option>
                <option value="customTime">设定时间后显示</option>
              </Select>
              <Text fontSize="sm" color={mutedTextColor} mt={1}>
                选择何时显示作业信息
              </Text>
            </Box>

            {assignmentSettings.displayTiming === 'customTime' && (
              <Box mt={4}>
                <Text fontWeight="medium" mb={2}>具体时间</Text>
                <Input
                  type="time"
                  ref={customTimeRef}
                  defaultValue={assignmentSettings.customTime}
                  isDisabled={!assignmentSettings.enabled}
                />
                <Text fontSize="sm" color={mutedTextColor} mt={1}>
                  到达指定时间后显示作业
                </Text>
              </Box>
            )}
          </VStack>
        </CardBody>
      </Card>

      <Box mt={6}>
        <Button
          colorScheme="blue"
          onClick={() => {
            if (serverUrlRef.current) {
              handleAssignmentSettingChange('serverUrl', serverUrlRef.current.value);
            }
            if (clientNameRef.current) {
              handleAssignmentSettingChange('clientName', clientNameRef.current.value);
            }
            if (customTimeRef.current) {
              handleAssignmentSettingChange('customTime', customTimeRef.current.value);
            }
            handleSaveAssignmentConfig();
          }}
          isDisabled={!assignmentSettings.enabled || isSaving}
          leftIcon={<Save size={18} />}
        >
          {isSaving ? '保存中...' : '保存配置'}
        </Button>
      </Box>
    </>
  );
};

const ReactGUI = () => {
  const { colorMode, toggleColorMode } = useColorMode();
  const [currentView, setCurrentView] = useState('main');
  const [settings, setSettings] = useState({
    isDuringClassCountdown: false,
    isWindowAlwaysOnTop: false,
    isDuringClassHidden: false,
    isAutoLaunch: false,
    scheduleShutdown: false
  });
  const [assignmentSettings, setAssignmentSettings] = useState({
    enabled: false,
    serverUrl: '',
    clientName: '',
    clientId: '',
    displayTiming: 'customTime',
    customTime: '21:00'
  });
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);


  const serverUrlRef = useRef(null);
  const clientNameRef = useRef(null);
  const customTimeRef = useRef(null);

  const isDarkMode = colorMode === 'dark';

  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const sidebarBg = useColorModeValue('white', 'gray.800');
  const headerBg = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.800', 'white');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const cardBg = useColorModeValue('white', 'gray.800');
  const mutedTextColor = useColorModeValue('gray.500', 'gray.400');

  useEffect(() => {
    ipcRenderer.on('init', (event, data) => {
      setSettings({
        isDuringClassCountdown: data.isDuringClassCountdown,
        isWindowAlwaysOnTop: data.isWindowAlwaysOnTop,
        isDuringClassHidden: data.isDuringClassHidden,
        isAutoLaunch: data.isAutoLaunch,
        scheduleShutdown: data.scheduleShutdown
      });
    });

    ipcRenderer.on('updateCheckbox', (event, data) => {
      if (data.id in settings) {
        setSettings(prev => ({
          ...prev,
          [data.id]: data.checked
        }));
      }
    });

    return () => {
      ipcRenderer.removeAllListeners('init');
      ipcRenderer.removeAllListeners('updateCheckbox');
    };
  }, []);

  useEffect(() => {
    ipcRenderer.invoke('getAssignmentConfig').then(result => {
      if (result && result.success && result.data) {
        const data = result.data;
        const displayPeriod = data.assignmentDisplayPeriod;
        let displayTiming = 'afterAllClasses';
        let customTime = '21:00';

        if (typeof displayPeriod === 'string' && displayPeriod.startsWith('time:')) {
          displayTiming = 'customTime';
          customTime = displayPeriod.replace('time:', '');
        }

        setAssignmentSettings({
          enabled: data.assignmentEnabled || false,
          serverUrl: data.serverURL || '',
          clientName: data.clientName || '',
          clientId: data.clientId || '',
          displayTiming: displayTiming,
          customTime: customTime
        });
      }
    });

    ipcRenderer.on('ws-status', (event, status) => {
      setWsStatus(status);
    });

    ipcRenderer.invoke('getWsStatus').then(result => {
      if (result && result.status) {
        setWsStatus(result.status);
      }
    });

    return () => {
      ipcRenderer.removeAllListeners('ws-status');
    };
  }, []);

  const handleSettingChange = (settingName) => {
    const newValue = !settings[settingName];
    setSettings(prev => ({
      ...prev,
      [settingName]: newValue
    }));

    const ipcMessages = {
      isDuringClassCountdown: 'setClassCountdown',
      isWindowAlwaysOnTop: 'setWindowAlwaysOnTop',
      isDuringClassHidden: 'setDuringClassHidden',
      isAutoLaunch: 'setAutoLaunch',
      scheduleShutdown: 'setScheduleShutdown'
    };

    ipcRenderer.send(ipcMessages[settingName], newValue);
  };

  const handleButtonClick = (action, value) => {
    const ipcMessages = {
      week1: ['setWeekIndex', 0],
      week2: ['setWeekIndex', 1],
      openSetting: ['openSettingDialog'],
      correctTime: ['getTimeOffset', 0],
      toggleSchedule: ['setDayOffset'],
      manageShutdown: ['openShutdownManager'],
      devTools: ['openDevTools'],
      resetSettings: ['resetSettings'],
      moreInfo: ['showMoreInfo'],
      quitApp: ['quitApp']
    };

    const [message, ...args] = ipcMessages[action] || [action];
    ipcRenderer.send(message, ...(args.length ? args : []));
  };

  const handleAssignmentSettingChange = (field, value) => {
    setAssignmentSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const result = await ipcRenderer.invoke('get-logs');
      if (result && result.success) {
        setLogs(result.logs || []);
      } else {
        setLogs(['无法读取日志文件']);
      }
    } catch (error) {
      setLogs([`读取日志失败: ${error.message}`]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const openLogsFolder = () => {
    ipcRenderer.send('open-logs-folder');
  };



  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setWsStatus('connecting');
    try {
      const result = await ipcRenderer.invoke('testServerConnection', assignmentSettings.serverUrl);
      setIsTestingConnection(false);
      if (result.success) {
        setWsStatus('connected');
      } else {
        setWsStatus('disconnected');
      }
    } catch (error) {
      setIsTestingConnection(false);
      setWsStatus('disconnected');
    }
  };

  const handleSaveAssignmentConfig = async () => {
    setIsSaving(true);
    try {
      let assignmentDisplayPeriod;
      if (assignmentSettings.displayTiming === 'afterAllClasses') {
        assignmentDisplayPeriod = -1;
      } else if (assignmentSettings.displayTiming === 'customTime') {
        assignmentDisplayPeriod = `time:${assignmentSettings.customTime}`;
      } else {
        assignmentDisplayPeriod = -1;
      }

      const configToSave = {
        assignmentEnabled: assignmentSettings.enabled,
        serverURL: assignmentSettings.serverUrl,
        wsURL: assignmentSettings.serverUrl ? assignmentSettings.serverUrl.replace('http', 'ws') : '',
        clientName: assignmentSettings.clientName,
        clientId: assignmentSettings.clientId,
        assignmentDisplayPeriod: assignmentDisplayPeriod
      };
      const result = await ipcRenderer.invoke('saveAssignmentConfig', configToSave);
      setIsSaving(false);
      if (result && result.success) {
        if (result.clientId) {
          setAssignmentSettings(prev => ({ ...prev, clientId: result.clientId }));
        }
        if (assignmentSettings.enabled) {
          ipcRenderer.send('setAssignmentEnabled', true);
        }
      }
    } catch (error) {
      setIsSaving(false);
    }
  };

  /**
   * 处理注册客户端
   */
  const handleRegisterClient = async () => {
    if (!clientNameRef.current?.value) {
      return;
    }

    setIsRegistering(true);
    try {
      const serverUrl = serverUrlRef.current?.value || assignmentSettings.serverUrl;
      const clientName = clientNameRef.current.value;

      handleAssignmentSettingChange('serverUrl', serverUrl);
      handleAssignmentSettingChange('clientName', clientName);

      const configToSave = {
        assignmentEnabled: assignmentSettings.enabled,
        serverURL: serverUrl,
        wsURL: serverUrl ? serverUrl.replace('http', 'ws') : '',
        clientName: clientName,
        clientId: null,
        assignmentDisplayPeriod: assignmentSettings.displayTiming === 'customTime'
          ? `time:${assignmentSettings.customTime}`
          : -1
      };

      const result = await ipcRenderer.invoke('saveAssignmentConfig', configToSave);
      setIsRegistering(false);

      if (result && result.success && result.clientId) {
        setAssignmentSettings(prev => ({ ...prev, clientId: result.clientId }));
      }
    } catch (error) {
      setIsRegistering(false);
    }
  };

  const getConnectionStatusColor = (status) => {
    switch (status) {
      case 'connected':
        return 'green';
      case 'connecting':
        return 'yellow';
      case 'disconnected':
      default:
        return 'red';
    }
  };

  const getConnectionStatusText = (status) => {
    switch (status) {
      case 'connected':
        return '通信正常!';
      case 'connecting':
        return '连接中...';
      case 'disconnected':
      default:
        return '未连接';
    }
  };

  return (
    <Box display="flex" h="100vh" bg={bgColor} color={textColor} fontFamily="Segoe UI, system-ui, sans-serif">
      <Box
        w="280px"
        bg={sidebarBg}
        display="flex"
        flexDirection="column"
        boxShadow="lg"
        zIndex={100}
      >
        <Box
          display="flex"
          alignItems="center"
          gap={3}
          p={5}
          borderBottom="1px"
          borderColor={borderColor}
        >
          <Calendar size={32} color="#3182ce" />
          <Box>
            <Text fontWeight="semibold" fontSize="lg">课程表管理</Text>
            <Text fontSize="sm" color={mutedTextColor}>v1.0.0</Text>
          </Box>
        </Box>

        <Box flex={1} p={3} display="flex" flexDirection="column" gap={1}>
          <Button
            w="100%"
            justifyContent="flex-start"
            gap={3}
            h="44px"
            variant={currentView === 'main' ? 'solid' : 'ghost'}
            colorScheme={currentView === 'main' ? 'blue' : 'gray'}
            onClick={() => setCurrentView('main')}
            leftIcon={<Calendar size={20} />}
          >
            功能选项
          </Button>
          <Button
            w="100%"
            justifyContent="flex-start"
            gap={3}
            h="44px"
            variant={currentView === 'assignment' ? 'solid' : 'ghost'}
            colorScheme={currentView === 'assignment' ? 'blue' : 'gray'}
            onClick={() => setCurrentView('assignment')}
            leftIcon={<BookOpen size={20} />}
          >
            作业设置
          </Button>
          <Button
            w="100%"
            justifyContent="flex-start"
            gap={3}
            h="44px"
            variant={currentView === 'settings' ? 'solid' : 'ghost'}
            colorScheme={currentView === 'settings' ? 'blue' : 'gray'}
            onClick={() => setCurrentView('settings')}
            leftIcon={<Settings size={20} />}
          >
            设置选项
          </Button>
          <Button
            w="100%"
            justifyContent="flex-start"
            gap={3}
            h="44px"
            variant={currentView === 'tools' ? 'solid' : 'ghost'}
            colorScheme={currentView === 'tools' ? 'blue' : 'gray'}
            onClick={() => setCurrentView('tools')}
            leftIcon={<Wrench size={20} />}
          >
            其他工具
          </Button>
        </Box>

        <Box p={4} borderTop="1px" borderColor={borderColor} textAlign="center">
          <Text fontSize="sm" color={mutedTextColor}>
            © {new Date().getFullYear()} Enigfrank 版权所有
          </Text>
        </Box>
      </Box>

      <Box flex={1} display="flex" flexDirection="column" overflow="hidden">
        <Box
          display="flex"
          alignItems="center"
          justifyContent="space-between"
          px={8}
          py={5}
          bg={headerBg}
          borderBottom="1px"
          borderColor={borderColor}
        >
          <Box>
            <Heading size="md">仪表盘</Heading>
            <Text fontSize="sm" color={mutedTextColor}>
              Made By Enigfrank
            </Text>
          </Box>
          <Box display="flex" alignItems="center" gap={3}>
            <Tooltip label={isDarkMode ? '切换到浅色模式' : '切换到深色模式'} placement="bottom">
              <IconButton
                onClick={toggleColorMode}
                variant="ghost"
                aria-label="切换主题"
                icon={isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              />
            </Tooltip>
          </Box>
        </Box>

        <Box flex={1} p={8} overflowY="auto" bg={bgColor}>
          {currentView === 'main' && (
            <MainView
              handleButtonClick={handleButtonClick}
              mutedTextColor={mutedTextColor}
              cardBg={cardBg}
              borderColor={borderColor}
              useColorModeValue={useColorModeValue}
            />
          )}
          {currentView === 'assignment' && (
            <AssignmentView
              assignmentSettings={assignmentSettings}
              wsStatus={wsStatus}
              isTestingConnection={isTestingConnection}
              isSaving={isSaving}
              isRegistering={isRegistering}
              getConnectionStatusColor={getConnectionStatusColor}
              getConnectionStatusText={getConnectionStatusText}
              useColorModeValue={useColorModeValue}
              mutedTextColor={mutedTextColor}
              serverUrlRef={serverUrlRef}
              clientNameRef={clientNameRef}
              customTimeRef={customTimeRef}
              handleAssignmentSettingChange={handleAssignmentSettingChange}
              handleTestConnection={handleTestConnection}
              handleSaveAssignmentConfig={handleSaveAssignmentConfig}
              handleRegisterClient={handleRegisterClient}
            />
          )}
          {currentView === 'settings' && (
            <SettingsView
              settings={settings}
              handleSettingChange={handleSettingChange}
              mutedTextColor={mutedTextColor}
              borderColor={borderColor}
            />
          )}
          {currentView === 'tools' && (
            <ToolsView
              useColorModeValue={useColorModeValue}
              logs={logs}
              isLoadingLogs={isLoadingLogs}
              loadLogs={loadLogs}
              openLogsFolder={openLogsFolder}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
};

const App = () => {
  return (
    <ChakraProvider theme={theme}>
      <ReactGUI />
    </ChakraProvider>
  );
};

export default App;
