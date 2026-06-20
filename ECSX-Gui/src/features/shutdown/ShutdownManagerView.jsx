import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  FormControl,
  FormHelperText,
  HStack,
  IconButton,
  Input,
  Switch,
  Text,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { ArrowLeft, Clock3, Plus, Power, Trash2 } from 'lucide-react';
import { validateShutdownTime } from './shutdownTime.mjs';

/**
 * 将主进程返回的历史时间格式统一为渲染层使用的对象格式
 * @param {Array<string | {time: string, enabled?: boolean}>} times 定时关机时间列表
 * @returns {Array<{time: string, enabled: boolean}>} 规范化后的时间列表
 */
function normalizeShutdownTimes(times) {
  if (!Array.isArray(times)) return [];

  return times
    .map((item) => {
      if (typeof item === 'string') {
        return { time: item, enabled: true };
      }

      return {
        time: item?.time || '',
        enabled: item?.enabled !== false,
      };
    })
    .filter((item) => item.time);
}

/**
 * ECSX GUI 内嵌的定时关机管理视图
 * @param {{ipcRenderer: Electron.IpcRenderer, onBack: () => void}} props 组件属性
 * @returns {React.ReactElement} 定时关机管理界面
 */
const ShutdownManagerView = ({ ipcRenderer, onBack }) => {
  const [shutdownTimes, setShutdownTimes] = useState([]);
  const [newTime, setNewTime] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState(null);
  const inputRef = useRef(null);
  const cancelDeleteRef = useRef(null);

  const mutedTextColor = useColorModeValue('gray.600', 'gray.400');
  const subtleTextColor = useColorModeValue('gray.500', 'gray.500');
  const cardBg = useColorModeValue('white', 'gray.800');
  const panelBg = useColorModeValue('gray.50', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const disabledBg = useColorModeValue('gray.100', 'gray.700');

  /**
   * 从主进程读取最新定时关机时间列表
   * @returns {Promise<void>} 加载完成后更新本地状态
   */
  const loadShutdownTimes = useCallback(async () => {
    setIsLoading(true);

    try {
      const times = await ipcRenderer.invoke('getShutdownTimes');
      setShutdownTimes(normalizeShutdownTimes(times));
    } catch (error) {
      setErrorMessage(`读取定时关机时间失败: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [ipcRenderer]);

  useEffect(() => {
    /**
     * 接收主进程推送的定时关机时间更新
     * @param {Electron.IpcRendererEvent} _event IPC 事件对象
     * @param {Array<string | {time: string, enabled?: boolean}>} times 更新时间列表
     */
    const handleShutdownTimesUpdated = (_event, times) => {
      setShutdownTimes(normalizeShutdownTimes(times));
      setNewTime('');
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };

    loadShutdownTimes();
    ipcRenderer.on('shutdownTimesUpdated', handleShutdownTimesUpdated);

    return () => {
      ipcRenderer.removeListener('shutdownTimesUpdated', handleShutdownTimesUpdated);
    };
  }, [ipcRenderer, loadShutdownTimes]);

  /**
   * 校验并提交一个新的定时关机时间
   * @returns {void}
   */
  const handleAddTime = () => {
    const validation = validateShutdownTime(newTime);

    if (!validation.valid) {
      setErrorMessage(validation.message);
      return;
    }

    setErrorMessage('');
    ipcRenderer.send('addShutdownTime', { time: validation.value, enabled: true });
  };

  /**
   * 删除指定索引的定时关机时间
   * @param {number} index 时间项索引
   * @returns {void}
   */
  const handleDeleteTime = (index) => {
    if (!shutdownTimes[index]?.time) return;
    setPendingDeleteIndex(index);
  };

  /**
   * 关闭删除确认弹窗，并把焦点还给时间输入框
   * @returns {void}
   */
  const closeDeleteDialog = () => {
    setPendingDeleteIndex(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  /**
   * 确认删除当前待删除的定时关机时间
   * @returns {void}
   */
  const confirmDeleteTime = () => {
    if (pendingDeleteIndex === null) return;

    ipcRenderer.send('deleteShutdownTime', pendingDeleteIndex);
    closeDeleteDialog();
  };

  /**
   * 切换指定索引的定时关机启用状态
   * @param {number} index 时间项索引
   * @returns {void}
   */
  const handleToggleTime = (index) => {
    ipcRenderer.send('toggleShutdownTime', index);
  };

  /**
   * 处理输入框键盘提交
   * @param {React.KeyboardEvent<HTMLInputElement>} event 键盘事件
   * @returns {void}
   */
  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleAddTime();
    }
  };

  const pendingDeleteTime = pendingDeleteIndex === null ? '' : shutdownTimes[pendingDeleteIndex]?.time || '';

  return (
    <Box maxW="960px">
      <Button variant="ghost" leftIcon={<ArrowLeft size={16} />} mb={4} onClick={onBack}>
        返回功能选项
      </Button>

      <Flex align="flex-start" justify="space-between" gap={6} mb={6} flexWrap="wrap">
        <Box>
          <HStack spacing={3} mb={2}>
            <Flex
              w="40px"
              h="40px"
              align="center"
              justify="center"
              borderRadius="md"
              bg="blue.500"
              color="white"
            >
              <Power size={20} />
            </Flex>
            <Box>
              <Text fontSize="xl" fontWeight="semibold">
                定时关机管理
              </Text>
              <Text fontSize="sm" color={mutedTextColor}>
                设置自动关机时间，建议设置在下课后一分钟
              </Text>
            </Box>
          </HStack>
        </Box>
      </Flex>

      <Card bg={cardBg} borderRadius="lg">
        <CardBody>
          <FormControl mb={4}>
            <Flex gap={3} flexWrap={{ base: 'wrap', md: 'nowrap' }}>
              <Input
                ref={inputRef}
                value={newTime}
                onChange={(event) => setNewTime(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="输入时间，例如 12:11"
                autoFocus
                maxW={{ base: '100%', md: '240px' }}
              />
              <Button
                colorScheme="blue"
                leftIcon={<Plus size={16} />}
                onClick={handleAddTime}
                w={{ base: '100%', md: 'auto' }}
              >
                添加时间
              </Button>
            </Flex>
            <FormHelperText color={subtleTextColor}>
              时间格式为 HH:mm，例如 12:10 下课可设置为 12:11
            </FormHelperText>
          </FormControl>

          {errorMessage && (
            <Alert status="error" borderRadius="md" mb={4}>
              <AlertIcon />
              {errorMessage}
            </Alert>
          )}

          <Box
            border="1px"
            borderColor={borderColor}
            borderRadius="lg"
            bg={panelBg}
            minH="280px"
            maxH="420px"
            overflowY="auto"
            p={3}
          >
            {isLoading ? (
              <Flex align="center" justify="center" h="240px">
                <Text color={mutedTextColor}>正在加载定时关机时间...</Text>
              </Flex>
            ) : shutdownTimes.length === 0 ? (
              <Flex align="center" justify="center" direction="column" h="240px" color={mutedTextColor} textAlign="center">
                <Clock3 size={40} />
                <Text mt={3} fontWeight="medium">
                  暂无定时关机时间
                </Text>
                <Text fontSize="sm" mt={1}>
                  添加时间后，启用定时关机设置即可生效
                </Text>
              </Flex>
            ) : (
              <Flex direction="column" gap={2}>
                {shutdownTimes.map((item, index) => (
                  <Flex
                    key={`${item.time}-${index}`}
                    align="center"
                    justify="space-between"
                    gap={3}
                    p={4}
                    bg={item.enabled ? cardBg : disabledBg}
                    border="1px"
                    borderColor={borderColor}
                    borderRadius="md"
                  >
                    <HStack spacing={3}>
                      <Switch
                        isChecked={item.enabled}
                        onChange={() => handleToggleTime(index)}
                        colorScheme="blue"
                        aria-label={`切换 ${item.time} 定时关机`}
                      />
                      <Box>
                        <Text
                          fontSize="lg"
                          fontWeight="semibold"
                          color={item.enabled ? undefined : subtleTextColor}
                          textDecoration={item.enabled ? 'none' : 'line-through'}
                        >
                          {item.time}
                        </Text>
                        <Text fontSize="sm" color={mutedTextColor}>
                          {item.enabled ? '已启用' : '已停用'}
                        </Text>
                      </Box>
                    </HStack>
                    <Tooltip label="删除时间" placement="top">
                      <IconButton
                        icon={<Trash2 size={18} />}
                        aria-label={`删除 ${item.time}`}
                        variant="ghost"
                        colorScheme="red"
                        onClick={() => handleDeleteTime(index)}
                      />
                    </Tooltip>
                  </Flex>
                ))}
              </Flex>
            )}
          </Box>
        </CardBody>
      </Card>

      <AlertDialog
        isOpen={pendingDeleteIndex !== null}
        leastDestructiveRef={cancelDeleteRef}
        onClose={closeDeleteDialog}
      >
        <AlertDialogOverlay>
          <AlertDialogContent borderRadius="lg">
            <AlertDialogHeader fontSize="lg" fontWeight="semibold">
              删除定时关机时间
            </AlertDialogHeader>
            <AlertDialogBody>
              确定要删除时间 {pendingDeleteTime} 吗？
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelDeleteRef} variant="ghost" onClick={closeDeleteDialog}>
                取消
              </Button>
              <Button colorScheme="red" ml={3} onClick={confirmDeleteTime}>
                删除
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
};

export default ShutdownManagerView;
