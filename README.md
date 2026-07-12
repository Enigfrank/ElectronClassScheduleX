<p align="center">
  <img src="src/image/icon.png" width="128" alt="电子课表" />
</p>

<h1 align="center">Electron Class Schedule X</h1>
<p align="center">
  一个基于 Electron 的桌面课程表应用，支持多周轮换、窗口置顶与穿透，专为 Windows 平台打造。
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/Enigfrank/ElectronClassScheduleX?color=%23238b00&label=release" alt="release" />
  <img src="https://img.shields.io/github/license/Enigfrank/ElectronClassScheduleX?color=%234c1" alt="license" />
  <img src="https://img.shields.io/badge/platform-Windows%20x64-blue" alt="platform" />
  <img src="https://img.shields.io/github/actions/workflow/status/Enigfrank/ElectronClassScheduleX/main.yml?branch=main" alt="build" />
</p>

---

## 功能特性

- **当日课表** - 悬浮展示当天课程，并标记当前课程、下一节课程与倒计时
- **多周轮换** - 支持学校常见单双周 / 多周轮换课表
- **窗口置顶** - 课表始终悬浮在桌面上方，方便随时查看
- **点击穿透与自动隐藏** - 透传鼠标事件至下层窗口，并按上课状态自动调整显示
- **在线更新** - 支持启动后自动检查、手动检查、下载并重启安装更新
- **本地优先** - 所有数据保存在本地，无需联网即可正常使用

## 安装

从 [Releases](https://github.com/Enigfrank/ElectronClassScheduleX/releases) 页面下载最新 `Setup.*.exe` 安装包，双击运行即可。

> 首次运行时 Windows SmartScreen 可能会弹出警告，请点击 **"更多信息" → "仍要运行"**。这是未签名应用在 Windows 上的正常行为。

## 开发

### 环境要求

- [Node.js](https://nodejs.org/) >= 24
- [Yarn](https://yarnpkg.com/) >= 4（通过 Corepack 启用）
- Windows 10+ (x64)

### 安装依赖

```powershell
git clone https://github.com/Enigfrank/ElectronClassScheduleX.git
cd ElectronClassScheduleX

corepack enable
corepack yarn install --immutable

cd ECSX-Gui
npm ci
```

根目录使用 Yarn 管理 Electron 运行时，`ECSX-Gui/` 使用 npm 管理 React/Vite 前端。

### 本地开发

在第一个终端中持续监听 React 前端，并将结果写入 `src/dist/`：

```powershell
cd ECSX-Gui
npm run dev
```

在另一个位于仓库根目录的终端中启动 Electron：

```powershell
corepack yarn start
```

### 构建安装包

```powershell
cd ECSX-Gui
npm run build

cd ..
corepack yarn build
```

React GUI 构建产物位于 `src/dist/`，Electron 安装包位于 `out/`。根目录的 `corepack yarn build` 只执行 Electron 打包，不会自动运行 Vite 构建。

### 运行测试

在仓库根目录执行：

```powershell
corepack yarn test
```

该命令运行 `tests/*.test.js` 中的 Node.js 测试。

## 技术栈

| 层级 | 技术 |
| :--- | :--- |
| 桌面框架 | Electron 42 |
| 前端 UI | React 18 + Chakra UI 2 |
| 前端构建 | Vite 8 |
| 样式 | Chakra UI + CSS Variables（传统渲染页） |
| 图标 | Lucide React |
| 本地存储 | electron-store |
| 自动更新 | electron-updater |
| 构建 | electron-builder (NSIS) |

## 项目结构

```
.
├── .github/workflows/    # CI/CD 工作流
├── ECSX-Gui/              # React 前端（独立 Vite 项目）
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── src/                   # Electron 运行时代码与渲染资源
│   ├── main.js            # 入口
│   ├── modules/           # 功能模块
│   ├── js/                # 传统渲染页脚本
│   ├── css/               # 传统渲染页样式
│   ├── dist/              # ECSX-Gui 生成的渲染包
│   ├── image/             # 图标资源
│   └── *.html             # Electron 渲染页面
├── tests/                 # 测试文件
├── package.json           # 项目元数据与构建配置
└── yarn.lock              # 依赖锁文件
```

## 隐私

本应用为纯本地程序，**不收集、存储或传输任何用户数据**至远程服务器。所有课表配置仅保存在用户本地设备的 `%APPDATA%\electron-class-schedule-x` 目录下。

## 致谢

本项目基于 [ElectronClassSchedule](https://github.com/EnderWolf006/ElectronClassSchedule)（ECS V1）重构开发，感谢原作者的贡献。

## 许可证

本项目采用 [GNU General Public License v3.0](LICENSE) 开源协议。

---

<p align="center">
  <a href="https://www.star-history.com/#Enigfrank/ElectronClassScheduleX&Date">
    <img src="https://api.star-history.com/svg?repos=Enigfrank/ElectronClassScheduleX&type=Date" alt="Star History" width="600" />
  </a>
</p>
