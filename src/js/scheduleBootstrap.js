(function bootstrapSchedulePage() {
    const { ipcRenderer } = require('electron');
    window.scheduleBootstrapIpcRenderer = ipcRenderer;

    /**
     * 从主进程加载并校验课表配置，然后启动课表页面。
     */
    async function loadAndStartSchedulePage() {
        try {
            const result = await ipcRenderer.invoke('load-schedule-config');
            if (!result.success) {
                ipcRenderer.send('show-schedule-config-error', result.error);
                return;
            }

            window.startSchedulePage(result.config);
        } catch (error) {
            ipcRenderer.send('show-schedule-config-error', {
                type: 'bootstrap',
                title: '课表初始化失败',
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAndStartSchedulePage, { once: true });
    } else {
        loadAndStartSchedulePage();
    }
}());
