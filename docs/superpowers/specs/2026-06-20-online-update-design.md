# 在线更新功能设计

## 背景

ElectronClassScheduleX 当前使用 `electron-builder` 打包 Windows NSIS 安装包，并通过 GitHub Actions 在标签发布时上传 `.exe`、`.yml` 和 `.blockmap` 文件。项目尚未接入运行时自动更新。目标是在不破坏现有启动、托盘、GUI 和发布流程的前提下，新增适合中国大陆学校网络环境的在线更新能力。

## 目标

- 启动后自动检查一次更新。
- GUI 侧边栏新增独立的“在线更新”页面。
- 托盘菜单新增“检查更新”入口。
- 支持 GitHub 官方源和多个 URL 前缀代理源。
- 支持用户自定义 URL 前缀代理。
- 支持一键测试代理延迟，并推荐最快可用代理。
- 优先使用 `electron-updater` 的 NSIS 差分更新能力，降低后续版本下载流量。
- 更新失败时给出明确状态和日志，不影响主课表运行。

## 非目标

- 不支持系统代理配置，例如 `http://127.0.0.1:7890` 或 `socks5://127.0.0.1:7890`。
- 不改成 `nsis-web` 安装器。首次安装仍提供完整安装包，后续更新依靠 blockmap 差分下载。
- 不内置大量未知第三方 GitHub 加速站，避免稳定性和安全性不可控。
- 不在 OOBE 流程中加入更新设置，避免首次使用路径变复杂。

## 更新源设计

内置更新源分为官方源和 URL 前缀代理源：

| ID | 名称 | 前缀 | 默认 |
| --- | --- | --- | --- |
| `github` | GitHub 官方源 | 空 | 否 |
| `gh-proxy-v4` | v4.gh-proxy.org（推荐） | `https://v4.gh-proxy.org/` | 是 |
| `gh-proxy` | gh-proxy.org | `https://gh-proxy.org/` | 否 |
| `gh-proxy-v6` | v6.gh-proxy.org | `https://v6.gh-proxy.org/` | 否 |
| `gh-proxy-cdn` | cdn.gh-proxy.org | `https://cdn.gh-proxy.org/` | 否 |
| `custom` | 自定义代理 | 用户输入 | 否 |

代理拼接规则：

```text
<代理前缀>https://github.com/Enigfrank/ElectronClassScheduleX/releases/latest/download/latest.yml
<代理前缀>https://github.com/Enigfrank/ElectronClassScheduleX/releases/download/vX.Y.Z/<文件名>
```

自定义代理必须满足：

- 以 `https://` 开头。
- 自动补齐末尾 `/`。
- 只作为 URL 前缀，不接受脚本、查询模板或本机代理地址。

## 更新策略

默认配置：

```js
{
    autoCheckUpdates: true,
    useUpdateProxy: true,
    updateProxyId: 'gh-proxy-v4',
    customUpdateProxyPrefix: ''
}
```

启动策略：

1. 应用完成正常启动后，延迟短时间执行一次后台检查。
2. OOBE 未完成时不检查更新。
3. 开发环境不执行真实更新，只返回“开发环境跳过更新检查”。
4. 如果用户关闭自动检查，则启动时不检查。

手动策略：

1. GUI 在线更新页点击“检查更新”。
2. 托盘菜单点击“检查更新”。
3. 手动检查会显示无更新、失败和可更新状态。

回退策略：

1. 代理开启时优先使用用户选择的代理源。
2. 当前代理失败后，自动尝试 GitHub 官方源。
3. 官方源失败后，提示用户进入在线更新页测速并切换代理。
4. 代理关闭时只使用 GitHub 官方源。

安装策略：

1. 检查到新版本后，用户确认再下载。
2. 下载时展示进度、速度和已下载大小。
3. 下载完成后弹窗询问“立即重启安装”或“稍后安装”。
4. 用户选择立即安装时调用 `quitAndInstall()`。

## 差分更新和体积控制

Windows NSIS 更新继续使用 `.blockmap` 支持差分下载。发布工作流已经上传 `out/*.blockmap`，实现时必须保证 `.yml` 和 `.blockmap` 继续随 Release 上传。

预期行为：

- 普通小改动优先差分下载，不重复下载完整 100MB+ 安装包。
- 差分失败、版本跨度过大或文件变化过大时，`electron-updater` 可以回退完整包。
- GUI 文案需要避免承诺“一定只下载少量数据”。

CI 增加体积提醒：

- 安装包超过 120MB 时给 warning。
- 安装包超过 150MB 时使发布构建失败。

后续体积优化优先级：

1. 检查并移除未使用字体。
2. 检查图片和音频资源。
3. 确认 `src/dist` 只包含必要 GUI bundle。
4. 避免将前端开发依赖打入运行包。

## 模块设计

### `src/modules/updateManager.js`

新增独立更新管理模块，负责：

- 初始化 `electron-updater`。
- 根据配置创建 GitHub 官方源或代理源。
- 检查更新。
- 下载更新。
- 安装更新。
- 代理延迟测试。
- 将状态广播给 GUI。
- 将错误写入日志。

主要方法：

- `initialize()`
- `checkForUpdates(options)`
- `downloadUpdate()`
- `installUpdate()`
- `testUpdateSources()`
- `getUpdateSettings()`
- `setUpdateSettings(settings)`
- `broadcastStatus(status)`

所有方法需要添加函数级注释。

### `src/modules/appLifecycleManager.js`

改动：

- 构造函数中增加 `updateManager`。
- `initializeModules()` 中创建 `UpdateManager`。
- `initializeApp()` 创建主窗口和托盘后，调用启动自动检查。
- `getModules()` 返回 `updateManager`。

### `src/modules/ipcManager.js`

改动：

- 构造函数接收 `updateManager`。
- 新增更新 IPC：
  - `get-update-settings`
  - `set-update-settings`
  - `check-for-updates`
  - `download-update`
  - `install-update`
  - `test-update-sources`
  - `get-update-status`
- 监听更新状态并转发给 GUI。

### `src/modules/trayManager.js`

改动：

- 构造函数接收可选 `updateManager`。
- 托盘菜单新增“检查更新”。
- 点击后触发手动检查，并通过系统对话框或 GUI 状态反馈结果。

### `src/modules/configManager.js`

改动：

- 在默认配置中增加更新相关配置。
- 增加更新配置 getter/setter，避免 GUI 直接依赖配置键名。

## GUI 设计

侧边栏新增：

```text
在线更新
```

图标使用 Lucide `DownloadCloud` 或 `RefreshCw`，与当前 GUI 的 Lucide 图标体系保持一致。

页面使用当前 GUI 的 Chakra 组件风格：

- 保持左侧导航、顶部标题、内容区布局一致。
- 使用现有 `Card`、`CardBody`、`Button`、`Switch`、`SimpleGrid`、`Tooltip`。
- 不使用渐变、玻璃拟态、emoji 图标或额外图标库。
- 新增交互控件遵循当前间距和字号习惯，避免引入独立视觉体系。
- 页面结构按当前 GUI 的 “系统诊断” 页密度处理，不做营销式大卡片。

页面内容：

- 当前版本。
- 最新版本。
- 更新状态。
- 下载进度。
- 当前更新源。
- 启动后自动检查开关。
- 使用更新加速代理开关。
- 代理选择列表。
- 自定义代理输入框。
- 代理测速结果表。

主要按钮：

- 检查更新。
- 下载更新。
- 立即重启安装。
- 测试代理延迟。

状态展示：

- `idle`: 未检查。
- `checking`: 正在检查。
- `available`: 有新版本。
- `not-available`: 已是最新。
- `downloading`: 正在下载。
- `downloaded`: 下载完成。
- `error`: 更新失败。

## 代理测速设计

测速目标：

```text
https://github.com/Enigfrank/ElectronClassScheduleX/releases/latest/download/latest.yml
```

测速流程：

1. 为每个启用的源构造目标 URL。
2. 主进程发起 HTTPS 请求。
3. 设置超时，例如 8000ms。
4. 记录首字节耗时、总耗时、HTTP 状态码和错误信息。
5. GUI 按延迟排序展示结果。
6. 可用且最快的代理标记为推荐。

测速结果只作为建议，不自动改用户选择，除非用户点击“使用此代理”。

## 错误处理

错误分级：

- 网络不可达。
- 代理不可达。
- 更新元数据不存在。
- 版本已是最新。
- 下载失败。
- 安装失败。

用户提示：

- 启动后台检查失败只写日志，不弹窗打扰。
- 手动检查失败显示明确错误。
- 下载失败提示切换代理或稍后重试。
- 安装失败提示重启应用后再试。

日志：

- 所有检查、下载、切源和测速结果写入现有 logger。
- 错误日志包含更新源 ID、请求 URL 类型和错误消息，但不记录用户隐私数据。

## 发布配置

`package.json`：

- 新增依赖 `electron-updater`。
- 增加 `build.publish`，指向 GitHub 仓库。
- 增加 `build.artifactName`，显式固定 Windows 产物名称。
- 保留 `--publish never` 的普通本地构建。
- 增加发布脚本用于 CI 或手动发布。

产物命名约束：

- 当前 CI 实际产物名称为 `Setup.x.x.x.exe`，不包含 `productName`。
- 实现时仍然需要显式配置 `artifactName`，避免未来 `electron-builder` 默认命名规则、`productName` 或本地环境差异导致 Release 附件名称变化。
- 推荐固定为 ASCII 名称：

```json
"artifactName": "Setup.${version}.${ext}"
```

- 更新代码不硬编码 `Setup.x.x.x.exe`，仍以 `latest.yml` 中的 `path` 和 `files` 为准。
- 代理下载 URL 只拼接 `latest.yml` 和其声明的文件路径，避免中文文件名、空格或 URL 编码差异影响代理下载。

GitHub Actions：

- 继续上传 `.exe`、`.yml`、`.blockmap`。
- 增加安装包体积检查。
- 保持 release tag 为 `v*.*.*`。

## 测试计划

自动测试：

- 更新源配置校验。
- 自定义代理规范化。
- 代理 URL 拼接。
- 更新状态转换。
- 体积阈值脚本。

手动测试：

- 开发环境启动不执行真实更新。
- GUI 能读取和保存更新设置。
- 托盘“检查更新”能触发更新检查。
- 代理测速能返回可用、不可用和超时状态。
- 下载完成后能显示安装提示。
- 关闭代理后只使用 GitHub 官方源。

发布验证：

- tag 发布后 Release 包含 `.exe`、`.yml`、`.blockmap`。
- `latest.yml` 可通过官方源访问。
- `latest.yml` 可通过 `v4.gh-proxy.org` 访问。
- 旧版本客户端能发现新版本。

## 风险

- 第三方代理可能失效或被劫持。缓解方式是保留官方源、自定义源、测速和日志。
- GitHub Release 附件名称变化会影响代理下载。缓解方式是依赖 `latest.yml` 元数据，不在代码里硬编码安装包文件名。
- 未签名安装包可能被 Windows 拦截。该风险已存在，更新功能不会消除。
- 差分更新不是强保证。GUI 文案只说明“优先使用差分下载”，不承诺固定下载大小。
