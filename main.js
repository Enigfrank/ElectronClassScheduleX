// 全局变量定义
let win = undefined;
let tray = undefined;
let testGUIWindow = undefined; // 新定义的测试GUI窗口变量
let loadingDialog = undefined; // 添加加载对话框变量
let shutdownTimers = []; // 添加定时关机计时器数组
let shutdownManagerWindow = null;
let currentShutdownWarningWindow = null;

const { app, BrowserWindow, Menu, ipcMain, dialog, screen, Tray, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const createShortcut = require('windows-shortcuts');
const prompt = require('electron-prompt');
const Store = require('electron-store');
const { DisableMinimize } = require('electron-disable-minimize');
const { exec } = require('child_process');
const store = new Store();
const basePath = app.isPackaged ? path.join(__dirname, '..') : __dirname;
const startupFolderPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const log = require('electron-log');



// 检查单例锁
if (!app.requestSingleInstanceLock({ key: '电子课表' })) {
    app.quit();
}

// 统一使用 app.getAppPath() 作为日志目录基础路径
const baseLogsPath = path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'logs');

// 确保日志目录存在
if (!fs.existsSync(baseLogsPath)) {
    fs.mkdirSync(baseLogsPath, { recursive: true });
}

// 按日期和序号生成日志文件
log.transports.file.resolvePathFn = () => {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `${date}.log`; // 固定日期文件名，不再添加序号
    return path.join(baseLogsPath, fileName);
};

// 日志配置
log.transports.file.level = 'info';
log.transports.console.level = 'info';
log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}';
log.transports.console.format = '{h}:{i}:{s}.{ms} [{level}] {text}';

// 错误捕获配置
log.catchErrors({
    showDialog: false,
    onError: (error) => {
        log.error('应用程序错误:', error);
    }
});

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
    log.error('未处理的 Promise 拒绝:', reason);
    log.error('Promise:', promise);
});

// 捕获未捕获的异常
process.on('uncaughtException', (error) => {
    log.error('未捕获的异常:', error);
});

// 捕获渲染进程错误
app.on('web-contents-created', (event, contents) => {
    contents.on('crashed', (event, killed) => {
        log.error(`WebContents crashed (killed=${killed})`);
    });
});

// 修正清理函数，使用相同的路径
function cleanupOldLogs() {
    const logsPath = path.join(app.getAppPath(), 'logs');  // 保持一致
    if (!fs.existsSync(logsPath)) return;

    const files = fs.readdirSync(logsPath);
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天

    files.forEach(file => {
        if (file.endsWith('.log')) {
            const filePath = path.join(logsPath, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtime.getTime() > maxAge) {
                fs.unlinkSync(filePath);
                log.info(`删除旧日志文件: ${file}`);
            }
        }
    });
}

log.info('-------------------------日志分割处-------------------------');

// 在应用启动时清理旧日志
app.whenReady().then(() => {
    cleanupOldLogs();
});


const getAssetPath = (...paths) => {
    // 无论是否打包，都基于当前文件目录（main.js 所在目录）计算路径
    const fullPath = path.join(__dirname, ...paths);

    // 增加路径检查日志（方便调试）
    if (!fs.existsSync(fullPath)) {
        log.error(`资源不存在: ${fullPath}`);
    }
    return fullPath;
};


function showMessage(win, title, message, type = 'info') {
    dialog.showMessageBox(win, {
        title,
        message,
        type, // 自动匹配图标（info: 信息图标，warn: 警告图标，error: 错误图标）
        buttons: ['知道了']
    });
}
//eg : showMessage(win, '输入错误', '偏移秒数不能为空！', 'warn');


// 创建主窗口
const createWindow = () => {
    win = new BrowserWindow({
        x: 0,
        y: 0,
        width: screen.getPrimaryDisplay().workAreaSize.width,
        height: 200,
        frame: false,
        transparent: true,
        alwaysOnTop: store.get('isWindowAlwaysOnTop', true),
        minimizable: false,
        maximizable: false,
        autoHideMenuBar: true,
        resizable: false,
        type: 'toolbar',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
    });


    win.loadFile(path.join(__dirname, 'index.html')).catch(err => {
        console.error('Failed to load index.html:', err);
        log.error('Failed to load index.html:', err);

    });
    if (store.get('isWindowAlwaysOnTop', true)) {
        win.setAlwaysOnTop(true, 'screen-saver');
    }
    initializeShutdownSchedule()
};

// 自启动设置
function setAutoLaunch() {
    const shortcutName = '电子课表(请勿重命名).lnk';
    app.setLoginItemSettings({
        openAtLogin: false,
        openAsHidden: false
    });
    if (store.get('isAutoLaunch', true)) {
        createShortcut.create(path.join(startupFolderPath, shortcutName), {
            target: app.getPath('exe'),
            workingDir: path.dirname(app.getPath('exe')),
        }, (err) => {
            if (err) {
                log.error('Error creating shortcut:', err);
                dialog.showErrorBox('错误', '创建快捷方式时出错: ' + err.message);
            }
        });
    } else {
        fs.unlink(path.join(startupFolderPath, shortcutName), (err) => {
            if (err) {
                log.error('Error deleting shortcut:', err);
                dialog.showErrorBox('错误', '删除快捷方式时出错: ' + err.message);
            }
        });
    }
}




function scheduleShutdown() {
    const storedTimes = store.get('shutdownTimes', []);
    const currentTimes = [...storedTimes];
    const shutdownPlans = [];

    // 清除之前的定时器
    shutdownTimers.forEach(clearTimeout);
    shutdownTimers.length = 0;

    currentTimes.forEach((timeStr, index) => {
        const timeParts = timeStr.match(/^(\d{2}):(\d{2})$/);
        if (!timeParts) {
            log.error(`无效时间格式: ${timeStr}`);
            return;
        }

        const [_, hour, minute] = timeParts;
        const now = new Date();
        let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

        if (targetDate <= now) {
            targetDate.setDate(targetDate.getDate() + 1);
        }

        const delay = targetDate - now;
        if (delay <= 0) {
            log.warn(`已过期时间: ${timeStr}，已自动移除`);
            currentTimes.splice(index, 1);
            return;
        }

        // 递归执行关机逻辑，支持多次推迟
        function scheduleShutdownWithWarning(currentTargetDate) {
            const now = new Date();
            const remainingDelay = currentTargetDate - now;

            if (remainingDelay <= 0) {
                executeShutdown(timeStr, currentTargetDate);
                return;
            }

            const warningDelay = remainingDelay - 15 * 1000;

            // 声明一个变量，用于保存最终关机定时器 ID
            let finalShutdownTimer = null;

            if (warningDelay > 0) {
                const warningTimerId = setTimeout(() => {
                    exec('powershell -c "[System.Media.SystemSounds]::Exclamation.Play()"', (err) => {
                        if (err) log.warn('播放系统提示音失败:', err.message);
                    });

                    // 显示提醒窗口
                    showShutdownWarningWindow(timeStr, currentTargetDate,
                        // 延长30秒
                        () => {
                            if (finalShutdownTimer) {
                                clearTimeout(finalShutdownTimer);
                                log.info('已取消原定关机定时器');
                            }

                            const newTarget = new Date(currentTargetDate.getTime() + 30 * 1000);
                            log.info(`用户选择延长30秒关机，新关机时间: ${newTarget.toLocaleString()}`);
                            scheduleShutdownWithWarning(newTarget); // 递归调用新时间
                        },
                        // 延长60秒
                        () => {
                            // 👇 清除旧的关机定时器！
                            if (finalShutdownTimer) {
                                clearTimeout(finalShutdownTimer);
                                log.info('已取消原定关机定时器');
                            }

                            const newTarget = new Date(currentTargetDate.getTime() + 60 * 1000);
                            log.info(`用户选择延长60秒关机，新关机时间: ${newTarget.toLocaleString()}`);
                            scheduleShutdownWithWarning(newTarget); // 递归调用新时间
                        },
                        // 关闭提示（不干预）
                        () => {
                            log.info(`用户选择关闭提示，继续执行关机流程`);
                        }
                    );

                    // ⏱️ 设置最终关机定时器（15秒后）
                    finalShutdownTimer = setTimeout(() => {
                        executeShutdown(timeStr, currentTargetDate);
                    }, 15 * 1000);

                    // 👇 保存到全局定时器数组，方便统一清理
                    shutdownTimers.push(finalShutdownTimer);

                }, warningDelay);

                shutdownTimers.push(warningTimerId);
            } else {
                // 如果已经小于15秒，直接设置关机
                const finalTimerId = setTimeout(() => executeShutdown(timeStr, currentTargetDate), remainingDelay);
                shutdownTimers.push(finalTimerId);
            }
        }

        // 执行实际关机
        function executeShutdown(originalTime, targetDate) {
            // 关闭可能还在显示的提醒窗口
            if (currentShutdownWarningWindow && !currentShutdownWarningWindow.isDestroyed()) {
                currentShutdownWarningWindow.close();
            }

            exec('shutdown /s /t 0', (error) => {
                if (error) {
                    log.error(`关机失败 (${originalTime}): ${error.message}`);
                    dialog.showMessageBox({
                        title: '关机失败',
                        message: `计划于 ${targetDate.toLocaleString()} 的关机任务失败！\n错误详情: ${error.message}`
                    });
                } else {
                    log.info(`成功触发关机 (${originalTime})，关机时间: ${targetDate.toLocaleString()}`);
                }
            });
        }

        // 启动带提醒的关机调度
        scheduleShutdownWithWarning(targetDate);

        // 记录详细计划信息
        shutdownPlans.push({
            originalTime: timeStr,
            formattedDate: targetDate.toLocaleString(),
            delay: delay
        });
    });

    // 更新存储
    if (currentTimes.length !== storedTimes.length) {
        store.set('shutdownTimes', currentTimes);
    }

    // 显示关机计划提示（使用原模态框，不影响倒计时）
    if (shutdownPlans.length > 0) {
        const messageContent = shutdownPlans.map((plan, index) =>
            `• 计划 ${index + 1}:\n` +
            `  原始时间: ${plan.originalTime}\n` +
            `  实际触发时间: ${plan.formattedDate}\n` +
            `  剩余时间: ${Math.ceil(plan.delay / 1000)} 秒`
        ).join('\n\n');

        dialog.showMessageBox({
            title: '关机计划提示',
            message: `已为您设置以下关机任务：\n\n${messageContent}`,
            buttons: ['知道了'],
            cancelId: 0
        });

        log.info(`成功设置 ${shutdownPlans.length} 个关机计划`);
        shutdownPlans.forEach((plan, index) => {
            log.info(`[${index + 1}] 原始时间: ${plan.originalTime} | 触发时间: ${plan.formattedDate} | 剩余 ${Math.ceil(plan.delay / 1000)} 秒`);
        });
    } else {
        dialog.showMessageBox({
            title: '温馨提示',
            message: '当前没有设置有效的关机任务',
            type: 'info'
        });
    }
}

// 👇 自定义关机提醒窗口函数

function showShutdownWarningWindow(timeStr, targetDate, onDelay30, onDelay60, onClose) {
    if (currentShutdownWarningWindow && !currentShutdownWarningWindow.isDestroyed()) {
        currentShutdownWarningWindow.close();
    }

    const shutdownWarningWin = new BrowserWindow({
        width: 360,
        height: 220,
        alwaysOnTop: true,
        frame: false,
        resizable: false,
        movable: true,
        skipTaskbar: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });

    currentShutdownWarningWindow = shutdownWarningWin;
    const htmlPath = path.join(__dirname, 'shutdown-warning.html');
    shutdownWarningWin.loadFile(htmlPath);

    shutdownWarningWin.webContents.on('did-finish-load', () => {
        shutdownWarningWin.webContents.executeJavaScript(`
            window.shutdownTargetTime = "${targetDate.toLocaleString()}";
            if (document.getElementById('targetTime')) {
                document.getElementById('targetTime').textContent = window.shutdownTargetTime;
            }
        `);
    });

    // 挂载回调函数到窗口实例（不传递给前端）
    shutdownWarningWin.onDelay30 = onDelay30;
    shutdownWarningWin.onDelay60 = onDelay60;
    shutdownWarningWin.onClose = onClose;

    shutdownWarningWin.on('closed', () => {
        currentShutdownWarningWindow = null;
        // 清理引用，避免内存泄漏
        shutdownWarningWin.onDelay30 = null;
        shutdownWarningWin.onDelay60 = null;
        shutdownWarningWin.onClose = null;
    });
}

// 定义取消定时关机的函数
function clearScheduledShutdown() {
    shutdownTimers.forEach(timerId => clearTimeout(timerId));
    shutdownTimers.length = 0; // 清空数组
    console.log('Scheduled shutdown canceled');
    log.info('Scheduled shutdown canceled');
    dialog.showMessageBox({
        title: '关机取消',
        message: '已取消定时关机'
    });
}

// 初始化定时关机
function initializeShutdownSchedule() {
    const isScheduled = store.get('scheduleShutdown', false);
    if (isScheduled) {
        scheduleShutdown();
    }
}

// 欢迎对话框
async function firstopen() {
    return await dialog.showMessageBox({
        type: 'info',
        buttons: ['OK'],
        title: '欢迎使用!',
        message: '欢迎使用电子课表,课程配置请在根目录中的js文件夹中的scheduleConfig.js文件进行修改' + '\n' + '\n' + '祝您使用愉快!(本提示只显示一次)' + '\n' + 'Developer : Enigfrank'
    });
}

// 显示加载对话框
function showLoadingDialog() {
    loadingDialog = new BrowserWindow({
        width: 600,
        height: 400,
        frame: false, // 无边框窗口
        alwaysOnTop: true, // 窗口置顶
        modal: true, // 模态窗口
        parent: win, // 指定父窗口
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // 加载自定义的加载界面，可以放一个简单的 HTML 文件
    loadingDialog.loadFile(path.join(__dirname, 'loading.html'));
}

// 创建GUI窗口
function showGUIWindow() {
    if (testGUIWindow) {
        testGUIWindow.show();
    } else {
        testGUIWindow = new BrowserWindow({
            width: 1280,
            height: 900, // 增加高度以容纳更多内容
            title: '课表配置界面',
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                enableRemoteModule: true
            }
        });
        testGUIWindow.loadFile(path.join(__dirname, 'GUI.html'));
        testGUIWindow.on('close', () => {
            testGUIWindow = null;
        });

        // 在窗口加载完成后，发送初始化数据
        testGUIWindow.webContents.on('did-finish-load', () => {
            testGUIWindow.webContents.send('init', {
                isDuringClassCountdown: store.get('isDuringClassCountdown', true),
                isWindowAlwaysOnTop: store.get('isWindowAlwaysOnTop', true),
                isDuringClassHidden: store.get('isDuringClassHidden', true),
                isAutoLaunch: store.get('isAutoLaunch', true),
                scheduleShutdown: store.get('scheduleShutdown', false)
            });
        });
    }
}

// 更新托盘菜单
function updateTrayMenu() {
    if (tray) {
        const contextMenu = Menu.buildFromTemplate(getTrayMenuTemplate());
        tray.setContextMenu(contextMenu);
    }
}

// 获取托盘菜单模板
function getTrayMenuTemplate() {
    return [
        {
            icon: getAssetPath('image', 'setting.png'),
            label: '打开配置界面',
            click: () => showGUIWindow()
        },
        { type: 'separator' },
        {
            icon: getAssetPath('image', 'quit.png'),
            label: '退出程序',
            click: () => {
                dialog.showMessageBox(win, {
                    title: '请确认',
                    message: '你确定要退出程序吗?',
                    buttons: ['取消', '确定']
                }).then((data) => { if (data.response) app.quit(); });
            }
        }
    ];
}


// 托盘点击事件处理
function trayClicked() {
    showGUIWindow();
}

app.whenReady().then(async () => {
    const isFirstRun = store.get('isFirstRun', true);
    if (isFirstRun) {
        await firstopen();
        store.set('isFirstRun', false);
        createWindow();
        Menu.setApplicationMenu(null);
        win.webContents.on('did-finish-load', () => {
            win.webContents.send('getWeekIndex');
        });
        const handle = win.getNativeWindowHandle();
        DisableMinimize(handle);
        setAutoLaunch();
    } else {
        showLoadingDialog();
        setTimeout(() => {
            if (loadingDialog) {
                loadingDialog.close();
            }
            createWindow();
            Menu.setApplicationMenu(null);
            win.webContents.on('did-finish-load', () => {
                win.webContents.send('getWeekIndex');
            });
            const handle = win.getNativeWindowHandle();
            DisableMinimize(handle);
            setAutoLaunch();
        }, 1000); // 固定延迟时间，提升用户体验
    }
});



ipcMain.on('shutdown-action', (event, action) => {
    const win = BrowserWindow.fromWebContents(event.sender);

    if (!win || win.isDestroyed()) return;

    // 根据窗口上挂载的回调函数执行对应操作
    switch (action) {
        case 'delay30':
            if (typeof win.onDelay30 === 'function') {
                win.onDelay30();
            }
            break;
        case 'delay60':
            if (typeof win.onDelay60 === 'function') {
                win.onDelay60();
            }
            break;
        case 'close':
            if (typeof win.onClose === 'function') {
                win.onClose();
            }
            break;
        default:
            console.warn('未知的关机操作:', action);
    }
});


app.on('before-quit', () => {
    if (testGUIWindow) {
        testGUIWindow.close();
        clearScheduledShutdown();
    }
});

ipcMain.handle('getShutdownTimes', () => {
    return store.get('shutdownTimes', []);
});

ipcMain.on('addShutdownTime', async (event, time) => {
    const times = store.get('shutdownTimes', []);
    times.push(time);
    store.set('shutdownTimes', times);
    scheduleShutdown(); // 添加后立即重新计算
    event.sender.send('shutdownTimesUpdated', times);
});

ipcMain.on('deleteShutdownTime', (event, index) => {
    const times = store.get('shutdownTimes', []);
    times.splice(index, 1);
    store.set('shutdownTimes', times);
    scheduleShutdown(); // 删除后立即重新计算
    event.sender.send('shutdownTimesUpdated', times);
});

ipcMain.on('openShutdownManager', async (event) => {
    if (shutdownManagerWindow) {
        shutdownManagerWindow.focus();
        return;
    }
    shutdownManagerWindow = new BrowserWindow({
        width: 650,
        height: 650,
        frame: true, // 无边框窗口
        alwaysOnTop: true, // 窗口置顶
        modal: true, // 模态窗口
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    shutdownManagerWindow.loadFile('shutdownManager.html');
    shutdownManagerWindow.on('closed', () => {
        shutdownManagerWindow = null;
    });
    shutdownManagerWindow.webContents.on('did-finish-load', () => {
        const times = store.get('shutdownTimes', []);
        shutdownManagerWindow.webContents.send('shutdownTimesUpdated', times);
    });

});





// 集中管理IPC事件
const ipcEvents = {
    'getWeekIndex': () => {
        const trayIconPath = getAssetPath('image', 'icon.png');
        tray = new Tray(trayIconPath);
        tray.setToolTip('电子课表');
        tray.on('click', trayClicked);
        updateTrayMenu();
    },
    'setWeekIndex': (e, index) => {
        win.webContents.send('setWeekIndex', index);
    },
    'openSettingDialog': () => {
        win.webContents.send('openSettingDialog');
    },
    'setDayOffset': () => {
        win.webContents.send('setDayOffset');
    },
    'setClassCountdown': (e, checked) => {
        store.set('isDuringClassCountdown', checked);
        win.webContents.send('ClassCountdown', checked);
        updateTrayMenu();
    },
    'setWindowAlwaysOnTop': (e, checked) => {
        store.set('isWindowAlwaysOnTop', checked);
        if (checked) {
            win.setAlwaysOnTop(true, 'screen-saver', 9999999999999);
        } else {
            win.setAlwaysOnTop(false);
        }
        updateTrayMenu();
    },
    'setDuringClassHidden': (e, checked) => {
        store.set('isDuringClassHidden', checked);
        win.webContents.send('ClassHidden', checked);
        updateTrayMenu();
    },
    'setAutoLaunch': (e, checked) => {
        store.set('isAutoLaunch', checked);
        setAutoLaunch();
        updateTrayMenu();
    },
    'setScheduleShutdown': (e, checked) => {
        store.set('scheduleShutdown', checked);
        if (checked) {
            scheduleShutdown();
        } else {
            clearScheduledShutdown();
        }
        updateTrayMenu();
    },
    'openDevTools': () => {
        if (win.webContents.isDevToolsOpened()) {
            win.webContents.closeDevTools();
        } else {
            win.webContents.openDevTools();
        }
    },
    'resetSettings': () => {
        dialog.showMessageBox({
            title: '重置设置',
            message: '请选择重置内容',
            buttons: ['恢复初始设置', '其他操作'],
        }).then((data) => {
            if (data.response === 0) {
                store.set('isFirstRun', true);
                app.relaunch();
                app.exit(0);
            } else if (data.response === 1) {
                // 创建恶作剧窗口
                let amtls = new BrowserWindow({
                    width: 800,
                    height: 680,
                    frame: false,
                    alwaysOnTop: true,
                    modal: true,
                    webPreferences: {
                        nodeIntegration: true,
                        contextIsolation: false
                    }
                });

                amtls.loadFile('amtls.html');

                // 3秒后自动关闭窗口
                setTimeout(() => {
                    if (amtls && !amtls.isDestroyed()) {
                        amtls.close();
                    }
                }, 5000);

                amtls.on('closed', () => {
                    amtls = null;
                });
            }
        }).catch((error) => {
            console.error('重置设置时出错:', error);
        });
    },
    'showMoreInfo': () => {
        dialog.showMessageBox({
            type: 'info',
            buttons: ['OK'],
            title: 'Let us across hell and reach to heaven！',
            message: '当前版本: ${process.app.getVersion()} ' + '\n' + '\n' + '作者: Enigfrank' + '\n' + '项目地址:https://github.com/Tripoccca/ElectronClassSchedule_Personal',
        });
    },
    'quitApp': () => {
        dialog.showMessageBox(win, {
            title: '请确认',
            message: '你确定要退出程序吗?',
            buttons: ['取消', '确定']
        }).then((data) => {
            if (data.response) app.quit();
        });
    },
    'log': (e, arg) => {
        console.log(arg);
    },
    'setIgnore': (e, arg) => {
        if (arg) {
            win.setIgnoreMouseEvents(true, { forward: true });
        } else {
            win.setIgnoreMouseEvents(false);
        }
    },
    'dialog': (e, arg) => {
        dialog.showMessageBox(win, arg.options).then((data) => {
            e.reply(arg.reply, { 'arg': arg, 'index': data.response });
        });
    },
    'pop': (e, arg) => {
        tray.popUpContextMenu();
    },
    'getTimeOffset': (e, arg = 0) => {
        // 类型安全处理：确保初始值为数字类型
        const initialOffset = typeof arg === 'number' ? arg : 0;

        // 对话框配置对象（可抽离为常量提高复用性）
        const dialogConfig = {
            title: '计时矫正',
            label: '请设置课表计时与系统时的偏移秒数(整数)',
            value: initialOffset.toString(),
            inputAttrs: {
                type: 'number',
                step: '1',       // 限制只能输入整数
                min: '-86400',   // 最小偏移：-1天（秒）
                max: '86400'     // 最大偏移：+1天（秒）
            },
            type: 'input',
            height: 200,
            width: 400,
            icon: path.join(basePath, 'image', 'clock.png'),
            buttons: ['取消', '确认'],  // 明确按钮顺序
            defaultId: 1               // 默认聚焦确认按钮
        };

        prompt(dialogConfig).then((userInput) => {
            if (userInput === null) {  // 用户点击取消
                log.info('[时间偏移设置] 用户取消操作');
                dialog.showMessageBox(win, {
                    type: 'warning',
                    title: '操作取消',
                    message: '您已取消计时偏移设置'
                });
                return;
            }

            // 输入有效性验证
            const offsetStr = userInput.trim();
            if (offsetStr === '') {
                dialog.showMessageBox(win, {
                    type: 'error',
                    title: '输入无效',
                    message: '偏移秒数不能为空，请输入有效数字'
                });
                return;
            }

            const offset = Number(offsetStr);
            if (isNaN(offset)) {
                dialog.showMessageBox(win, {
                    type: 'error',
                    title: '输入无效',
                    message: '请输入有效的数字格式（如：3600 或 -1800）'
                });
                return;
            }

            // 范围校验（可选，根据业务需求调整）
            if (offset < dialogConfig.inputAttrs.min || offset > dialogConfig.inputAttrs.max) {
                dialog.showMessageBox(win, {
                    type: 'warning',
                    title: '超出范围',
                    message: `建议偏移范围：${dialogConfig.inputAttrs.min} ~ ${dialogConfig.inputAttrs.max} 秒`
                });
                // 这里不阻止设置，仅提示，根据需求决定是否强制限制
                // return; 
            }

            // 发送偏移量（保留原始数值，移除可能不必要的取模操作）
            win.webContents.send('setTimeOffset', offset);
            log.info(`[时间偏移设置] 成功设置偏移量：${offset} 秒`);
            dialog.showMessageBox(win, {
                type: 'info',
                title: '设置成功',
                message: `计时偏移已更新为 ${offset} 秒`
            });

        }).catch((err) => {
            console.error('[时间偏移设置] 对话框操作异常:', err);
            log.error('[时间偏移设置] 对话框异常:', err.stack);  // 记录完整堆栈
            dialog.showMessageBox(win, {
                type: 'error',
                title: '系统错误',
                message: '设置过程中发生异常，请联系管理员'
            });
        });
    },

};


//注册ipcEvent中的每一项为事件监听器
for (const [event, handler] of Object.entries(ipcEvents)) {
    ipcMain.on(event, handler);
}

