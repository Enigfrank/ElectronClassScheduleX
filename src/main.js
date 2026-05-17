const AppLifecycleManager = require('./modules/appLifecycleManager');

// 创建应用生命周期管理器实例
const appLifecycle = new AppLifecycleManager();

// 启动应用
appLifecycle.start();

// 导出模块实例供其他可能的调试或扩展使用
module.exports = appLifecycle.getModules();
