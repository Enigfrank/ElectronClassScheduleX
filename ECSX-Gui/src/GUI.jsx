import React, { useState, useEffect } from 'react';
import './GUI.css';
import ShutdownManagerView from './features/shutdown/ShutdownManagerView.jsx';
import ScheduleEditorView from './features/schedule-editor/ScheduleEditorView.jsx';
import UpdateManagerView from './features/update/UpdateManagerView.jsx';
import ExamModeView from './features/exam-mode/ExamModeView.jsx';
import WindowControls from './WindowControls.jsx';
import {
  Box, Flex, Text, Heading, Button, Switch, Card, CardBody,
  SimpleGrid, Divider, Tooltip, IconButton, Menu, MenuButton,
  MenuList, MenuItem, useColorMode, useColorModeValue, ChakraProvider,
  extendTheme // <-- 修复点：加回 extendTheme
} from '@chakra-ui/react';
import {
  Calendar, Settings, Wrench, Clock, RefreshCw, Timer, Pin,
  EyeOff, Rocket, Power, RotateCcw, Info, X, Plus, MoreHorizontal,
  Sun, Moon, Globe, FolderOpen, FilePenLine, DownloadCloud, ClipboardCheck
} from 'lucide-react';

const ipcRenderer = window.dashboardApi;

// 恢复原有的主题定义
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

const QuickActions = () => {
  return (
    <Flex gap={3} mt={6} flexWrap="wrap">
      <Tooltip label="打开官方文档" placement="bottom">
        <Button colorScheme="blue" onClick={() => ipcRenderer.send('open-external-link', 'https://doc.cavendi.top/')} leftIcon={<Globe size={18} />}>
          官方文档
        </Button>
      </Tooltip>
      <Tooltip label="NULL" placement="bottom">
        <Button isDisabled leftIcon={<RefreshCw size={18} />}>NULL</Button>
      </Tooltip>
      <Menu>
        <MenuButton as={Button} variant="outline" leftIcon={<MoreHorizontal size={18} />}>更多</MenuButton>
        <MenuList>
          <MenuItem isDisabled>NULL</MenuItem>
          <MenuItem isDisabled>NULL</MenuItem>
          <Divider />
          <MenuItem isDisabled>NULL</MenuItem>
        </MenuList>
      </Menu>
    </Flex>
  );
};

const ToolsBar = ({ handleButtonClick }) => {
  // 直接在组件内部调用 Hook，而不是通过 Props 传递
  const cardBgOrange = useColorModeValue('orange.100', 'orange.900');
  const cardBgRed = useColorModeValue('red.100', 'red.900');
  const cardBgBlue = useColorModeValue('blue.100', 'blue.900');
  const subTextColor = useColorModeValue('gray.500', 'gray.400');

  const tools = [
    { action: 'devTools', bg: cardBgOrange, icon: <Wrench size={18} />, title: '开发者工具', desc: '打开开发者调试工具' },
    { action: 'resetSettings', bg: cardBgRed, icon: <RotateCcw size={18} />, title: '重置设置', desc: '恢复默认设置' },
    { action: 'moreInfo', bg: cardBgBlue, icon: <Info size={18} />, title: '更多信息', desc: '查看应用信息' },
    { action: 'quitApp', bg: 'gray.700', icon: <X size={18} />, title: '退出程序', desc: '关闭应用', color: 'white', descColor: 'gray.300' },
  ];

  return (
    <SimpleGrid columns={[1, 2, 4]} gap={4} mt={4}>
      {tools.map(tool => (
        <Card
          key={tool.action}
          cursor="pointer"
          className="dashboard-action-card"
          onClick={() => handleButtonClick(tool.action)}
          bg={tool.bg}
          color={tool.color}
          _hover={{ transform: 'translateY(-2px)', shadow: 'lg' }}
        >
          <CardBody>
            <Flex align="center" gap={2} fontWeight="semibold">
              {tool.icon} {tool.title}
            </Flex>
            <Text fontSize="sm" color={tool.descColor || subTextColor} mt={1}>{tool.desc}</Text>
          </CardBody>
        </Card>
      ))}
    </SimpleGrid>
  );
};

const ExtensionPlaceholder = () => {
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const mutedTextColor = useColorModeValue('gray.500', 'gray.400');

  return (
    <Box mt={8} p={6} bg={cardBg} borderRadius="xl" border="2px dashed" borderColor={borderColor} textAlign="center">
      <Text fontWeight="semibold" fontSize="lg" color={mutedTextColor}>扩展功能区域(TODO)</Text>
      <Text fontSize="sm" color={mutedTextColor} mt={2} display="block">插件、小组件和其他扩展将在这里显示</Text>
      <Box mt={4}>
        <Button variant="outline" size="sm" leftIcon={<Plus size={16} />} isDisabled>添加扩展(TODO)</Button>
      </Box>
    </Box>
  );
};

const MainView = ({ handleButtonClick, semesterStartDate }) => {
  const mutedTextColor = useColorModeValue('gray.500', 'gray.400');

  const weekActions = semesterStartDate
    ? [{ action: 'automaticWeek', interactive: false, icon: <Calendar size={40} />, title: '自动单双周已启用', desc: `从 ${semesterStartDate} 起每 7 天自动切换` }]
    : [
      { action: 'week1', icon: <Calendar size={40} />, title: '手动单周', desc: '未设置学期起始日期时使用' },
      { action: 'week2', icon: <Calendar size={40} />, title: '手动双周', desc: '未设置学期起始日期时使用' },
    ];
  const actions = [
    ...weekActions,
    { action: 'openSetting', icon: <Settings size={40} />, title: '配置课表', desc: '临时调整课程信息' },
    { action: 'correctTime', icon: <Clock size={40} />, title: '矫正计时', desc: '校准系统时间偏移' },
    { action: 'toggleSchedule', icon: <RefreshCw size={40} />, title: '切换日程', desc: '调休适用.....' },
    { action: 'manageShutdown', icon: <Power size={40} />, title: '管理定时关机', desc: '设置自动关机时间' },
  ];

  return (
    <>
      <Text fontSize="xl" fontWeight="semibold" mb={4}>功能选项</Text>
      <SimpleGrid columns={[1, 2, 3]} gap={5} maxW="1200px">
        {actions.map(act => (
          <Card
            key={act.action}
            cursor={act.interactive === false ? 'default' : 'pointer'}
            className={act.interactive === false ? undefined : 'dashboard-action-card'}
            onClick={act.interactive === false ? undefined : () => handleButtonClick(act.action)}
            minH="140px"
            _hover={act.interactive === false ? undefined : { transform: 'translateY(-2px)', shadow: 'xl' }}
            aria-disabled={act.interactive === false}
          >
            <Box bg="blue.500" color="white" h="80px" display="flex" alignItems="center" justifyContent="center" borderTopRadius="md">
              {act.icon}
            </Box>
            <CardBody>
              <Text fontWeight="semibold">{act.title}</Text>
              <Text fontSize="sm" color={mutedTextColor}>{act.desc}</Text>
            </CardBody>
          </Card>
        ))}
      </SimpleGrid>
      <QuickActions />
      <ToolsBar handleButtonClick={handleButtonClick} />
      <ExtensionPlaceholder />
    </>
  );
};

const SettingsView = ({ settings, handleSettingChange }) => {
  const mutedTextColor = useColorModeValue('gray.500', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  const settingItems = [
    { id: 'isDuringClassCountdown', icon: <Timer size={20} />, label: '课上计时', desc: '在课程进行中显示倒计时' },
    { id: 'isWindowAlwaysOnTop', icon: <Pin size={20} />, label: '窗口置顶', desc: '保持窗口始终在最前端' },
    { id: 'isDuringClassHidden', icon: <EyeOff size={20} />, label: '上课隐藏', desc: '上课期间自动隐藏窗口' },
    { id: 'isAutoLaunch', icon: <Rocket size={20} />, label: '开机启动', desc: '系统启动时自动运行' },
  ];

  return (
    <>
      <Text fontSize="xl" fontWeight="semibold" mb={4}>设置选项</Text>
      <Card>
        <CardBody>
          {settingItems.map((item, index) => (
            <Flex key={item.id} align="center" justify="space-between" py={4}
              borderBottom={index < settingItems.length - 1 ? '1px' : 'none'} borderColor={borderColor}>
              <Flex align="center" gap={3}>
                {item.icon}
                <Box>
                  <Text fontWeight="semibold">{item.label}</Text>
                  <Text fontSize="sm" color={mutedTextColor} display="block">{item.desc}</Text>
                </Box>
              </Flex>
              <Switch isChecked={settings[item.id]} onChange={() => handleSettingChange(item.id)} colorScheme="blue" />
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
                <Text fontSize="sm" color={mutedTextColor} display="block">重新打开OOBE初始设置向导</Text>
              </Box>
            </Flex>
            <Button size="sm" variant="outline" onClick={() => ipcRenderer.send('open-oobe')}>运行</Button>
          </Flex>
          {/* 其余的 TODO 设置可以保留，但建议未来也用数组 map 渲染 */}
        </CardBody>
      </Card>
    </>
  );
};

const ToolsView = ({ logs, isLoadingLogs, loadLogs, openLogsFolder }) => {
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const textMuted = useColorModeValue('gray.600', 'gray.400');
  const logBoxBg = useColorModeValue('gray.50', 'gray.900');

  return (
    <>
      <Text fontSize="xl" fontWeight="semibold" mt={6} mb={4}>系统诊断</Text>
      <Card>
        <CardBody>
          <Text fontSize="lg" fontWeight="medium" mb={3}>应用运行日志</Text>
          {logs.length === 0 && !isLoadingLogs ? (
            <Text color={textMuted} fontSize="sm">暂无日志内容，点击"加载日志"按钮查看最新日志</Text>
          ) : (
            <Box h="300px" maxH="300px" overflowY="auto" p={3} bg={logBoxBg} borderRadius="md"
              border="1px" borderColor={borderColor} fontSize="sm" fontFamily="monospace"
              display="flex" flexDirection="column">
              {isLoadingLogs ? <Text color={textMuted}>正在加载日志...</Text>
                : logs.map((log, index) => <Text key={index} fontSize="xs" mb={1}>{log}</Text>)}
            </Box>
          )}
          <Box mt={4} display="flex" gap={2}>
            <Button leftIcon={<Wrench size={16} />} onClick={loadLogs} isLoading={isLoadingLogs} loadingText="加载中...">加载日志</Button>
            <Button leftIcon={<FolderOpen size={16} />} onClick={openLogsFolder} variant="outline">打开日志文件夹</Button>
          </Box>
        </CardBody>
      </Card>
    </>
  );
};

const ReactGUI = () => {
  const { colorMode, toggleColorMode } = useColorMode();
  const [currentView, setCurrentView] = useState('main');
  const [settings, setSettings] = useState({
    isDuringClassCountdown: false, isWindowAlwaysOnTop: false,
    isDuringClassHidden: false, isAutoLaunch: false, scheduleShutdown: false
  });
  const [logs, setLogs] = useState([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [semesterStartDate, setSemesterStartDate] = useState('');

  const isDarkMode = colorMode === 'dark';
  const bgColor = useColorModeValue('gray.50', 'gray.900');
  const sidebarBg = useColorModeValue('white', 'gray.800');
  const headerBg = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.800', 'white');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const mutedTextColor = useColorModeValue('gray.500', 'gray.400');

  const viewTitles = {
    main: { title: '仪表盘', subtitle: 'Dashboard' },
    settings: { title: '设置选项', subtitle: 'Settings' },
    editor: { title: '课表编辑器', subtitle: 'Schedule Editor' },
    exam: { title: '考试模式', subtitle: 'Exam Mode' },
    update: { title: '在线更新', subtitle: '在线更新' },
    tools: { title: '其他工具', subtitle: 'Tools' },
    shutdown: { title: '定时关机管理', subtitle: 'Shutdown Manager' },
  };

  useEffect(() => {
    // 优化 IPC 监听器清理
    const handleInit = (event, data) => {
      setSettings({
        isDuringClassCountdown: data.isDuringClassCountdown,
        isWindowAlwaysOnTop: data.isWindowAlwaysOnTop,
        isDuringClassHidden: data.isDuringClassHidden,
        isAutoLaunch: data.isAutoLaunch,
        scheduleShutdown: data.scheduleShutdown
      });
    };
    const handleUpdate = (event, data) => {
      setSettings(prev => ({ ...prev, [data.id]: data.checked }));
    };

    const unsubscribeInit = ipcRenderer.on('init', handleInit);
    const unsubscribeUpdate = ipcRenderer.on('updateCheckbox', handleUpdate);

    return () => {
      unsubscribeInit();
      unsubscribeUpdate();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    /**
     * 读取当前课表的自动单双周配置。
     * @returns {Promise<void>} 配置读取完成
     */
    async function loadSemesterStartDate() {
      try {
        const result = await ipcRenderer.invoke('load-schedule-config');
        if (isMounted && result?.success) {
          setSemesterStartDate(typeof result.config?.semester_start_date === 'string' ? result.config.semester_start_date : '');
        }
      } catch {
        if (isMounted) setSemesterStartDate('');
      }
    }

    loadSemesterStartDate();
    return () => { isMounted = false; };
  }, []);

  const handleSettingChange = (settingName) => {
    const newValue = !settings[settingName];
    setSettings(prev => ({ ...prev, [settingName]: newValue }));
    const ipcMessages = {
      isDuringClassCountdown: 'setClassCountdown',
      isWindowAlwaysOnTop: 'setWindowAlwaysOnTop',
      isDuringClassHidden: 'setDuringClassHidden',
      isAutoLaunch: 'setAutoLaunch',
    };
    ipcRenderer.send(ipcMessages[settingName], newValue);
  };

  const handleButtonClick = (action) => {
    if (action === 'manageShutdown') {
      setCurrentView('shutdown');
      return;
    }

    const ipcMessages = {
      week1: ['setWeekIndex', 0], week2: ['setWeekIndex', 1],
      openSetting: ['openSettingDialog'], correctTime: ['getTimeOffset', 0],
      toggleSchedule: ['setDayOffset'],
      devTools: ['openDevTools'], resetSettings: ['resetSettings'],
      moreInfo: ['showMoreInfo'], quitApp: ['quitApp']
    };
    const [message, ...args] = ipcMessages[action] || [action];
    ipcRenderer.send(message, ...(args.length ? args : []));
  };

  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const result = await ipcRenderer.invoke('get-logs');
      setLogs(result?.success ? (result.logs || []) : ['无法读取日志文件']);
    } catch (error) {
      setLogs([`读取日志失败: ${error.message}`]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  return (
    <Box display="flex" h="100vh" bg={bgColor} color={textColor} fontFamily="Segoe UI, system-ui, sans-serif">
      {/* 侧边栏 */}
      <Box w="280px" bg={sidebarBg} display="flex" flexDirection="column" boxShadow="lg" zIndex={100}>
        <Box className="gui-drag-region" display="flex" alignItems="center" gap={3} p={5} borderBottom="1px" borderColor={borderColor}>
          <Calendar size={32} color="#3182ce" />
          <Box>
            <Text fontWeight="semibold" fontSize="lg">课表管理</Text>
            <Text fontSize="sm" color={mutedTextColor}>Evaluation version</Text>
          </Box>
        </Box>

        <Box flex={1} p={3} display="flex" flexDirection="column" gap={1}>
          {[
            { view: 'main', icon: <Calendar size={20} />, text: '功能选项' },
            { view: 'settings', icon: <Settings size={20} />, text: '设置选项' },
            { view: 'editor', icon: <FilePenLine size={20} />, text: '课表编辑器' },
            { view: 'exam', icon: <ClipboardCheck size={20} />, text: '考试模式' },
            { view: 'update', icon: <DownloadCloud size={20} />, text: '在线更新' },
            { view: 'tools', icon: <Wrench size={20} />, text: '其他工具' },
          ].map(nav => (
            <Button key={nav.view} w="100%" justifyContent="flex-start" gap={3} h="44px"
              variant={currentView === nav.view ? 'solid' : 'ghost'}
              colorScheme={currentView === nav.view ? 'blue' : 'gray'}
              onClick={() => setCurrentView(nav.view)} leftIcon={nav.icon}>
              {nav.text}
            </Button>
          ))}
        </Box>

        <Box p={4} borderTop="1px" borderColor={borderColor} textAlign="center">
          <Text fontSize="sm" color={mutedTextColor}>© {new Date().getFullYear()} Enigfrank 版权所有</Text>
        </Box>
      </Box>

      {/* 主内容区 */}
      <Box flex={1} display="flex" flexDirection="column" overflow="hidden">
        <Box className="gui-drag-region" display="flex" alignItems="center" justifyContent="space-between" px={8} py={5}
          bg={headerBg} borderBottom="1px" borderColor={borderColor}>
          <Box>
            <Heading size="md">{viewTitles[currentView]?.title || '仪表盘'}</Heading>
            <Text fontSize="sm" color={mutedTextColor}>{viewTitles[currentView]?.subtitle || 'Dashboard'}</Text>
          </Box>
          <Flex align="center" gap={2} className="gui-no-drag">
            <Tooltip label={isDarkMode ? '切换到浅色模式' : '切换到深色模式'} placement="bottom">
              <IconButton onClick={toggleColorMode} variant="ghost" aria-label="切换主题"
                icon={isDarkMode ? <Sun size={20} /> : <Moon size={20} />} />
            </Tooltip>
            <WindowControls ipcRenderer={ipcRenderer} />
          </Flex>
        </Box>

        <Box flex={1} p={8} overflowY="auto" bg={bgColor}>
          {currentView === 'main' && <MainView handleButtonClick={handleButtonClick} semesterStartDate={semesterStartDate} />}
          {currentView === 'settings' && <SettingsView settings={settings} handleSettingChange={handleSettingChange} />}
          {currentView === 'editor' && (
            <ScheduleEditorView
              ipcRenderer={ipcRenderer}
              onConfigApplied={(nextConfig) => setSemesterStartDate(nextConfig.semester_start_date || '')}
            />
          )}
          {currentView === 'exam' && <ExamModeView ipcRenderer={ipcRenderer} />}
          {currentView === 'update' && <UpdateManagerView ipcRenderer={ipcRenderer} />}
          {currentView === 'shutdown' && <ShutdownManagerView ipcRenderer={ipcRenderer} onBack={() => setCurrentView('main')} />}
          {currentView === 'tools' && <ToolsView logs={logs} isLoadingLogs={isLoadingLogs} loadLogs={loadLogs} openLogsFolder={() => ipcRenderer.send('open-logs-folder')} />}
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
