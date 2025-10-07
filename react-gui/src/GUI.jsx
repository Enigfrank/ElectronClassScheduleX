import React, { useState, useEffect } from 'react';
import './GUI.css';

const { ipcRenderer } = window.require('electron');

const Icon = ({ type, className = '' }) => {
  const icons = {
    calendar: '📅',
    settings: '⚙️',
    clock: '⏰',
    sync: '🔄',
    chart: '📊',
    timer: '⏱️',
    pin: '📌',
    hide: '👁️‍🗨️',
    startup: '🚀',
    shutdown: '⏸️',
    tools: '🔧',
    reset: '🔄',
    info: 'ℹ️',
    quit: '❌',
    console: '💻',
    back: '←',
    check: '✓'
  };
  
  return <span className={`icon ${className}`}>{icons[type] || type}</span>;
};

const ReactGUI = () => {
  const [settings, setSettings] = useState({
    isDuringClassCountdown: false,
    isWindowAlwaysOnTop: false,
    isDuringClassHidden: false,
    isAutoLaunch: false,
    scheduleShutdown: false
  });
  
  const [currentView, setCurrentView] = useState('main'); // 'main', 'settings', 'tools'

  useEffect(() => {
    // 初始化设置
    ipcRenderer.on('init', (event, data) => {
      setSettings({
        isDuringClassCountdown: data.isDuringClassCountdown,
        isWindowAlwaysOnTop: data.isWindowAlwaysOnTop,
        isDuringClassHidden: data.isDuringClassHidden,
        isAutoLaunch: data.isAutoLaunch,
        scheduleShutdown: data.scheduleShutdown
      });
    });

    // 更新复选框
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

  const handleSettingChange = (settingName) => {
    const newValue = !settings[settingName];
    setSettings(prev => ({
      ...prev,
      [settingName]: newValue
    }));
    
    // 发送对应的IPC消息
    const ipcMessages = {
      isDuringClassCountdown: 'setClassCountdown',
      isWindowAlwaysOnTop: 'setWindowAlwaysOnTop',
      isDuringClassHidden: 'setDuringClassHidden',
      isAutoLaunch: 'setAutoLaunch',
      scheduleShutdown: 'setScheduleShutdown'
    };
    
    ipcRenderer.send(ipcMessages[settingName], newValue);
  };

  const handleButtonClick = (action) => {
    const ipcMessages = {
      week1: 'setWeekIndex',
      week2: 'setWeekIndex',
      openSetting: 'openSettingDialog',
      correctTime: 'getTimeOffset',
      toggleSchedule: 'setDayOffset',
      manageShutdown: 'openShutdownManager',
      devTools: 'openDevTools',
      resetSettings: 'resetSettings',
      moreInfo: 'showMoreInfo',
      quitApp: 'quitApp'
    };
    
    if (action === 'week1') {
      ipcRenderer.send(ipcMessages[action], 0);
    } else if (action === 'week2') {
      ipcRenderer.send(ipcMessages[action], 1);
    } else if (action === 'correctTime') {
      ipcRenderer.send(ipcMessages[action], 0);
    } else {
      ipcRenderer.send(ipcMessages[action]);
    }
  };

  const MainView = () => (
    <div className="main-view">
      <div className="section">
        <div className="section-header">
          <Icon type="console" />
          <h3>功能选项</h3>
        </div>
        <div className="function-grid">
          <button className="modern-btn" onClick={() => handleButtonClick('week1')}>
            <Icon type="calendar" />
            第一周
          </button>
          <button className="modern-btn" onClick={() => handleButtonClick('week2')}>
            <Icon type="calendar" />
            第二周
          </button>
          <button className="modern-btn" onClick={() => handleButtonClick('openSetting')}>
            <Icon type="settings" />
            配置课表
          </button>
          <button className="modern-btn" onClick={() => handleButtonClick('correctTime')}>
            <Icon type="clock" />
            矫正计时
          </button>
          <button className="modern-btn" onClick={() => handleButtonClick('toggleSchedule')}>
            <Icon type="sync" />
            切换日程
          </button>
          <button className="modern-btn" onClick={() => handleButtonClick('manageShutdown')}>
            <Icon type="shutdown" />
            管理定时关机
          </button>
        </div>
      </div>
    </div>
  );

  const SettingsView = () => (
    <div className="settings-view">
      <div className="section">
        <div className="section-header">
          <Icon type="settings" />
          <h3>设置选项</h3>
        </div>
        <div className="settings-list">
          <div className="setting-item">
            <div className="setting-info">
              <Icon type="timer" />
              <span>课上计时</span>
            </div>
            <div 
              className={`toggle-switch ${settings.isDuringClassCountdown ? 'active' : ''}`}
              onClick={() => handleSettingChange('isDuringClassCountdown')}
            >
              <div className="toggle-slider"></div>
            </div>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <Icon type="pin" />
              <span>窗口置顶</span>
            </div>
            <div 
              className={`toggle-switch ${settings.isWindowAlwaysOnTop ? 'active' : ''}`}
              onClick={() => handleSettingChange('isWindowAlwaysOnTop')}
            >
              <div className="toggle-slider"></div>
            </div>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <Icon type="hide" />
              <span>上课隐藏</span>
            </div>
            <div 
              className={`toggle-switch ${settings.isDuringClassHidden ? 'active' : ''}`}
              onClick={() => handleSettingChange('isDuringClassHidden')}
            >
              <div className="toggle-slider"></div>
            </div>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <Icon type="startup" />
              <span>开机启动</span>
            </div>
            <div 
              className={`toggle-switch ${settings.isAutoLaunch ? 'active' : ''}`}
              onClick={() => handleSettingChange('isAutoLaunch')}
            >
              <div className="toggle-slider"></div>
            </div>
          </div>
          
          <div className="setting-item">
            <div className="setting-info">
              <Icon type="shutdown" />
              <span>定时关机</span>
            </div>
            <div 
              className={`toggle-switch ${settings.scheduleShutdown ? 'active' : ''}`}
              onClick={() => handleSettingChange('scheduleShutdown')}
            >
              <div className="toggle-slider"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const ToolsView = () => (
    <div className="tools-view">
      <div className="section">
        <div className="section-header">
          <Icon type="tools" />
          <h3>其他工具</h3>
        </div>
        <div className="tools-grid">
          <button className="tool-btn warning" onClick={() => handleButtonClick('devTools')}>
            <Icon type="tools" />
            开发者工具
          </button>
          <button className="tool-btn danger" onClick={() => handleButtonClick('resetSettings')}>
            <Icon type="reset" />
            重置设置
          </button>
          <button className="tool-btn info" onClick={() => handleButtonClick('moreInfo')}>
            <Icon type="info" />
            更多信息
          </button>
          <button className="tool-btn dark" onClick={() => handleButtonClick('quitApp')}>
            <Icon type="quit" />
            退出程序
          </button>
        </div>
      </div>
    </div>
  );

  const Sidebar = () => (
    <div className="sidebar">
      <div className="sidebar-header">
        <Icon type="console" />
        <h2>控制台</h2>
      </div>
      
      <nav className="sidebar-nav">
        <button 
          className={`nav-item ${currentView === 'main' ? 'active' : ''}`}
          onClick={() => setCurrentView('main')}
        >
          <Icon type="calendar" />
          功能选项
        </button>
        
        <button 
          className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
          onClick={() => setCurrentView('settings')}
        >
          <Icon type="settings" />
          设置选项
        </button>
        
        <button 
          className={`nav-item ${currentView === 'tools' ? 'active' : ''}`}
          onClick={() => setCurrentView('tools')}
        >
          <Icon type="tools" />
          其他工具
        </button>
      </nav>
      
      <div className="sidebar-footer">
        <p>&copy; {new Date().getFullYear()} Enigfrank 版权所有</p>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <Sidebar />
      
      <div className="main-content">
        <div className="content-header">
          <h1>课程表管理系统</h1>
          <p>好看扣1不好看扣2</p>
        </div>
        
        <div className="content-area">
          {currentView === 'main' && <MainView />}
          {currentView === 'settings' && <SettingsView />}
          {currentView === 'tools' && <ToolsView />}
        </div>
      </div>
    </div>
  );
};

export default ReactGUI;