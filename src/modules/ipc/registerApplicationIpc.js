const SELECT_DIALOG_WIDTH = 350;
const SELECT_DIALOG_HEIGHT = 200;

/**
 * 将有序标签转换为 electron-prompt 使用的选项映射。
 * @param {string[]} items 选项标签
 * @returns {Record<string, string>} 以数组索引为值的选项映射
 */
function buildSelectOptions(items) {
    return items.reduce((options, item, index) => {
        options[String(index)] = item;
        return options;
    }, {});
}

/**
 * 注册应用级操作、通用对话框与计时校正 IPC 事件。
 * @param {{ipcMain: Electron.IpcMain, configManager: Object, windowManager: Object, app: Electron.App, dialog: Electron.Dialog, shell: Electron.Shell, BrowserWindow: typeof Electron.BrowserWindow, prompt: Function, path: Object, log: Function}} dependencies 注册依赖
 */
function registerApplicationIpc({
    ipcMain,
    configManager,
    windowManager,
    app,
    dialog,
    shell,
    BrowserWindow,
    prompt,
    path,
    log
}) {
    let amtlsWindow = null;

    /**
     * 获取课程选择窗口的父窗口，优先挂载到 Dashboard。
     * @returns {Electron.BrowserWindow|undefined} 可用的父窗口
     */
    function getSelectionParentWindow() {
        const guiWindow = windowManager.getWindow('gui');
        if (!guiWindow || (typeof guiWindow.isDestroyed === 'function' && guiWindow.isDestroyed())) {
            return undefined;
        }
        return guiWindow;
    }

    /**
     * 显示固定尺寸的下拉选择窗口，并沿用通用 dialog 的回复结构。
     * @param {Electron.IpcMainEvent} event IPC 事件
     * @param {{reply: string, items: string[], defaultIndex?: number, options?: {title?: string, message?: string}}} arg 选择请求
     * @returns {Promise<void>}
     */
    async function handleSelectDialog(event, arg) {
        const items = Array.isArray(arg?.items) ? arg.items : [];
        if (typeof arg?.reply !== 'string' || items.length === 0 || items.some((item) => typeof item !== 'string')) {
            log('warn', '[临时调课] 课程选择请求无效');
            if (typeof arg?.reply === 'string') event.reply(arg.reply, { arg, index: -1 });
            return;
        }

        const defaultIndex = Number.isInteger(arg.defaultIndex) && arg.defaultIndex >= 0 && arg.defaultIndex < items.length
            ? arg.defaultIndex
            : 0;
        const parentWindow = getSelectionParentWindow();

        try {
            const selectedValue = await prompt({
                title: arg.options?.title || '选择课程',
                label: arg.options?.message || '请选择要替换为的课程：',
                type: 'select',
                value: String(defaultIndex),
                selectOptions: buildSelectOptions(items),
                buttonLabels: { ok: '确认', cancel: '取消' },
                width: SELECT_DIALOG_WIDTH,
                minWidth: SELECT_DIALOG_WIDTH,
                height: SELECT_DIALOG_HEIGHT,
                minHeight: SELECT_DIALOG_HEIGHT,
                resizable: false,
                alwaysOnTop: !parentWindow
            }, parentWindow);

            const selectedIndex = selectedValue === null ? -1 : Number(selectedValue);
            const index = Number.isInteger(selectedIndex) && selectedIndex >= 0 && selectedIndex < items.length
                ? selectedIndex
                : -1;
            event.reply(arg.reply, { arg, index });
        } catch (error) {
            log('error', `[临时调课] 课程选择窗口异常: ${error.stack || error.message}`);
            event.reply(arg.reply, { arg, index: -1 });
        }
    }

    /**
     * 处理普通消息框或固定尺寸选择框请求。
     * @param {Electron.IpcMainEvent} event IPC 事件
     * @param {Object} arg 对话框请求
     * @returns {Promise<void>}
     */
    async function handleDialogRequest(event, arg) {
        if (arg?.kind === 'select') {
            await handleSelectDialog(event, arg);
            return;
        }

        const mainWindow = windowManager.getWindow('main');
        const data = await dialog.showMessageBox(mainWindow, arg.options);
        event.reply(arg.reply, { arg, index: data.response });
    }

    /**
     * 显示 AMTLS 提示窗口并在五秒后自动关闭。
     */
    function showAmtlsWindow() {
        amtlsWindow = new BrowserWindow({
            width: 800,
            height: 680,
            frame: false,
            alwaysOnTop: true,
            modal: true,
            webPreferences: { nodeIntegration: true, contextIsolation: false }
        });

        amtlsWindow.loadFile(path.join(__dirname, '..', '..', 'amtls.html'));
        setTimeout(() => amtlsWindow?.close(), 5000);
        amtlsWindow.on('closed', () => { amtlsWindow = null; });
    }

    /**
     * 显示计时偏移输入框并把结果发送给主课表窗口。
     * @param {Electron.IpcMainEvent} event IPC 事件
     * @param {*} arg 初始偏移值
     */
    function handleTimeOffsetSetting(event, arg = 0) {
        const initialOffset = typeof arg === 'number' ? arg : 0;
        const mainWindow = windowManager.getWindow('main');

        prompt({
            title: '计时矫正',
            label: '请设置课表计时与系统时的偏移秒数(整数)',
            value: initialOffset.toString(),
            inputAttrs: { type: 'number', step: '1', min: '-86400', max: '86400' },
            type: 'input',
            height: 200,
            width: 400,
            buttons: ['取消', '确认'],
            defaultId: 1
        }).then((userInput) => {
            if (userInput === null) return;

            const offsetStr = userInput.trim();
            const offset = Number(offsetStr);
            if (offsetStr === '' || isNaN(offset)) {
                dialog.showMessageBox(mainWindow, { type: 'error', title: '输入无效', message: '请输入有效的数字格式' });
                return;
            }

            mainWindow?.webContents.send('setTimeOffset', offset);
            dialog.showMessageBox(mainWindow, { type: 'info', title: '设置成功', message: `计时偏移已更新为 ${offset} 秒` });
        }).catch((error) => {
            log('error', `[时间偏移设置] 对话框异常: ${error.stack}`);
        });
    }

    ipcMain.on('resetSettings', () => {
        log('info', '[IPC管理] 重置设置');
        dialog.showMessageBox({
            title: '重置设置',
            message: '请选择重置内容',
            buttons: ['恢复初始设置', '其他操作']
        }).then((data) => {
            if (data.response === 0) {
                log('info', '[IPC管理] 用户选择恢复初始设置');
                configManager.set('isFirstRun', true);
                app.relaunch();
                app.exit(0);
            } else if (data.response === 1) {
                showAmtlsWindow();
            }
        }).catch((error) => log('error', `[IPC管理] 重置设置时出错: ${error.message}`));
    });

    ipcMain.on('showMoreInfo', () => {
        dialog.showMessageBox({
            type: 'info',
            buttons: ['OK'],
            title: 'Let us across hell and reach to heaven！',
            message: `当前版本: ${app.getVersion()}\n\n作者: Enigfrank\n项目地址:https://github.com/Enigfrank/ElectronClassScheduleX`
        });
    });

    ipcMain.on('quitApp', () => {
        const mainWindow = windowManager.getWindow('main');
        dialog.showMessageBox(mainWindow, {
            title: '请确认',
            message: '你确定要退出程序吗?',
            buttons: ['取消', '确定']
        }).then((data) => {
            if (data.response) app.quit();
        });
    });

    ipcMain.on('dialog', handleDialogRequest);

    ipcMain.on('getTimeOffset', (event, arg = 0) => handleTimeOffsetSetting(event, arg));

    ipcMain.on('open-external-link', (event, url) => {
        if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
            shell.openExternal(url).catch((error) => {
                log('error', `[IPC管理] 打开外部链接失败: ${error.message}`);
                dialog.showErrorBox('打开链接失败', `无法打开链接: ${url}\n错误: ${error.message}`);
            });
        } else {
            log('warn', `[IPC管理] 拒绝打开非法的外部链接: ${url}`);
        }
    });
}

module.exports = registerApplicationIpc;
