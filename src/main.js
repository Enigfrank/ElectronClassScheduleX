const AppLifecycleManager = require('./modules/appLifecycleManager');

// 创建应用生命周期管理器实例
const appLifecycle = new AppLifecycleManager();

// 启动应用
appLifecycle.start().catch(err => {
    console.error('应用启动过程中发生致命错误:', err);
    // 基础日志记录（如果 logger 尚未初始化）
    const fs = require('fs');
    const path = require('path');
    const errorLog = `[${new Date().toISOString()}] FATAL STARTUP ERROR: ${err.message}\n${err.stack}\n`;
    try {
        fs.appendFileSync(path.join(process.cwd(), 'startup-error.log'), errorLog);
    } catch (e) {
        // 忽略写入失败
    }
});

// 导出模块实例供其他可能的调试或扩展使用
module.exports = appLifecycle.getModules();
