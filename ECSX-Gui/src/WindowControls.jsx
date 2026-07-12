import React, { useEffect, useState } from 'react';
import { HStack, IconButton, Tooltip } from '@chakra-ui/react';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';

/**
 * 渲染 GUI 窗口的最小化、最大化和关闭控件。
 * @param {{ipcRenderer: Electron.IpcRenderer}} props 组件属性
 * @returns {React.ReactElement} 窗口控件
 */
export default function WindowControls({ ipcRenderer }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    /**
     * 同步主进程报告的最大化状态。
     * @param {Electron.IpcRendererEvent} event IPC 事件
     * @param {boolean} nextIsMaximized 是否已最大化
     */
    function handleMaximizedChange(event, nextIsMaximized) {
      setIsMaximized(Boolean(nextIsMaximized));
    }

    ipcRenderer.on('gui-window-maximized-changed', handleMaximizedChange);
    ipcRenderer.send('gui-window-action', 'get-state');
    return () => ipcRenderer.removeListener('gui-window-maximized-changed', handleMaximizedChange);
  }, [ipcRenderer]);

  return (
    <HStack spacing={1} className="gui-no-drag">
      <Tooltip label="最小化" placement="bottom">
        <IconButton
          aria-label="最小化窗口"
          icon={<Minus size={16} />}
          size="sm"
          variant="ghost"
          onClick={() => ipcRenderer.send('gui-window-action', 'minimize')}
        />
      </Tooltip>
      <Tooltip label={isMaximized ? '还原' : '最大化'} placement="bottom">
        <IconButton
          aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
          icon={isMaximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          size="sm"
          variant="ghost"
          onClick={() => ipcRenderer.send('gui-window-action', 'toggle-maximize')}
        />
      </Tooltip>
      <Tooltip label="关闭" placement="bottom">
        <IconButton
          aria-label="关闭窗口"
          icon={<X size={16} />}
          size="sm"
          variant="ghost"
          colorScheme="red"
          onClick={() => ipcRenderer.send('gui-window-action', 'close')}
        />
      </Tooltip>
    </HStack>
  );
}
