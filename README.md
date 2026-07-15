<p align="center">
  <img src="src/image/icon.png" width="128" alt="Electron Class Schedule X 图标" />
</p>

<h1 align="center">Electron Class Schedule X</h1>

<p align="center">
  面向 Windows 的开源桌面课程表，在屏幕顶部展示当天课程，并通过图形化仪表盘管理课表、考试安排和常用工具。
</p>

<p align="center">
  <a href="https://github.com/Enigfrank/ElectronClassScheduleX/releases/latest">
    <img src="https://img.shields.io/github/v/release/Enigfrank/ElectronClassScheduleX?label=release" alt="最新版本" />
  </a>
  <a href="https://github.com/Enigfrank/ElectronClassScheduleX/actions/workflows/main.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/Enigfrank/ElectronClassScheduleX/main.yml?label=release" alt="发布构建状态" />
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/Enigfrank/ElectronClassScheduleX" alt="许可证" />
  </a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64-0078D4" alt="Windows x64" />
</p>

<p align="center">
  <a href="https://github.com/Enigfrank/ElectronClassScheduleX/releases/latest">下载安装</a>
  ·
  <a href="https://github.com/Enigfrank/ElectronClassScheduleX/issues">问题反馈</a>
  ·
  <a href="#参与贡献">参与贡献</a>
</p>

## 项目简介

Electron Class Schedule X 是一个本地优先的 Windows 桌面课程表。应用使用置顶、透明且可穿透的顶部窗口展示当天课程，同时提供独立仪表盘完成课表编辑、单双周设置、临时调课、考试模式、定时关机和在线更新等操作。

课表与应用设置保存在本机，无需账号或云服务。除检查更新外，日常显示和编辑均可离线完成。

## 功能概览

| 功能 | 说明 |
| :--- | :--- |
| 顶部课表 | 展示当天课程、当前课程、下一节课程与倒计时 |
| 图形化编辑器 | 编辑科目、时间表、每日课表、分隔线和显示样式，支持配置导入与导出 |
| 单双周轮换 | 可按学期起始日期自动切换，也可手动选择单周或双周 |
| 临时调整 | 支持临时换课、调休切换日程和计时偏移校准，不覆盖长期课表 |
| 考试模式 | 配置考试科目与时间段，全屏显示当前或下一场考试及本机时钟 |
| 桌面集成 | 支持系统托盘、窗口置顶、点击穿透、自动隐藏、开机启动和迷你倒计时 |
| 定时关机 | 管理多个关机时间，并在执行前提供提醒、延迟或取消操作 |
| 在线更新 | 从 GitHub Releases 检查、下载并安装新版本，可配置更新代理 |

## 安装

1. 前往 [Releases](https://github.com/Enigfrank/ElectronClassScheduleX/releases/latest) 下载最新的 `Setup.<版本号>.exe`。
2. 运行安装程序并选择安装目录。
3. 首次启动后按照引导完成初始化，应用会自动创建默认课表配置。

当前发布目标为 Windows x64。应用尚未进行代码签名，Windows SmartScreen 可能显示安全提示；确认安装包来自本仓库 Releases 后，可选择“更多信息”并继续运行。

## 快速开始

1. 完成首次使用引导并等待应用重新启动。
2. 单击系统托盘中的课表图标，或在右键菜单中选择“打开配置界面”。
3. 在仪表盘中进入“课表编辑器”，配置课表后选择“保存配置并应用”。
4. 在“设置选项”中按需调整窗口置顶、上课隐藏、课上计时和开机启动。

关闭仪表盘不会退出应用，顶部课表和系统托盘仍会继续运行。需要完全退出时，请使用仪表盘或托盘菜单中的“退出程序”。

## 使用说明

### 长期课表与临时调整

| 操作 | 入口 | 生效范围 |
| :--- | :--- | :--- |
| 编辑长期课表 | 课表编辑器 | 保存到本机配置，重新启动后仍然有效 |
| 临时换课 | 功能选项 → 配置课表 | 仅当前运行期间有效，不修改课表文件 |
| 调休切换日程 | 功能选项 → 切换日程 | 临时让当天使用其他星期的日程 |
| 手动切换单双周 | 功能选项 → 手动单周 / 手动双周 | 未设置学期起始日期时可用 |
| 校准计时 | 功能选项 → 矫正计时 | 调整课表计时偏移 |

课表编辑器中的课程序号从 `0` 开始。需要配置单双周课程时，可在同一课程项中填写两个科目简称；编辑器支持英文逗号、中文逗号和顿号作为分隔符。

### 考试模式

在仪表盘中进入“考试模式”，添加考试科目、开始时间和结束时间后选择“应用”。应用会隐藏顶部课表和仪表盘，并在全屏页面中显示当前考试、下一场考试或“今日考试已结束”。退出考试模式后，原有窗口会自动恢复。

### 配置与备份

用户课表配置位于：

```text
%APPDATA%\electron-class-schedule-x\config\scheduleConfig.js
```

普通使用建议通过课表编辑器修改配置。迁移或备份课表时，可使用编辑器提供的导入、导出功能；导入后仍需保存并应用，才会覆盖当前配置。

## 开发

### 环境要求

- Windows x64
- Node.js 24.x，与当前 CI 环境一致
- Corepack 与 Yarn 4.14.1
- npm，用于管理 `ECSX-Gui/` 前端依赖

### 获取源码与安装依赖

```powershell
git clone https://github.com/Enigfrank/ElectronClassScheduleX.git
Set-Location .\ElectronClassScheduleX

corepack enable
corepack yarn install --immutable

Set-Location .\ECSX-Gui
npm ci
Set-Location ..
```

仓库根目录使用 Yarn 管理 Electron 应用，`ECSX-Gui/` 是独立的 React/Vite 项目并使用 npm 管理依赖。

### 本地开发

在第一个 PowerShell 终端中持续构建 React 仪表盘：

```powershell
Set-Location .\ECSX-Gui
npm run dev
```

该命令以监听模式把前端产物写入 `src/dist/`。随后在第二个、位于仓库根目录的 PowerShell 终端中启动 Electron：

```powershell
corepack yarn start
```

开发环境会监听仪表盘构建产物，并在文件更新后重新加载窗口。

### 运行测试

在仓库根目录执行：

```powershell
corepack yarn test
```

该命令使用 Node.js 内置测试运行器执行 `tests/*.test.js`。

### 构建安装包

```powershell
Set-Location .\ECSX-Gui
npm run build

Set-Location ..
corepack yarn build
```

`npm run build` 将 React 仪表盘写入 `src/dist/`，`corepack yarn build` 使用当前 `src/` 内容生成 Windows 安装包并输出到 `out/`。

根目录的 `build` 脚本不会自动构建 `ECSX-Gui/`。修改 React 源码后，必须先运行前端构建，再执行 Electron 打包。

## 项目结构

```text
ElectronClassScheduleX/
├── .github/workflows/     # GitHub Actions 发布工作流
├── ECSX-Gui/              # React 18 + Chakra UI 管理仪表盘
│   ├── src/               # 仪表盘源码
│   ├── package.json       # 前端依赖与脚本
│   └── vite.config.js     # 构建到 src/dist 的 Vite 配置
├── src/                   # Electron 应用源码与资源
│   ├── main.js            # 主进程入口
│   ├── modules/           # 窗口、配置、更新和系统功能模块
│   ├── preload/           # 各渲染窗口的安全桥接脚本
│   ├── shared/            # 主进程与渲染进程共享逻辑
│   ├── js/                # 传统渲染页面脚本
│   ├── css/               # 传统渲染页面样式
│   ├── dist/              # ECSX-Gui 生成的仪表盘构建产物
│   └── *.html             # Electron 渲染页面
├── tests/                 # Node.js 测试与 Electron 冒烟脚本
├── package.json           # Electron 依赖、脚本与打包配置
└── yarn.lock              # Yarn 锁文件
```

## 技术栈

| 用途 | 技术 |
| :--- | :--- |
| 桌面运行时 | Electron 42 |
| 管理仪表盘 | React 18、Chakra UI 2 |
| 前端构建 | Vite 8 |
| 图标 | Lucide React |
| 本地设置 | electron-store |
| 日志 | electron-log |
| 自动更新 | electron-updater |
| Windows 打包 | electron-builder、NSIS |

## 参与贡献

欢迎通过 Issue 和 Pull Request 改进项目。提交修改前请遵循以下流程：

1. 在 [Issues](https://github.com/Enigfrank/ElectronClassScheduleX/issues) 中检索已有问题；新功能或较大改动建议先创建 Issue 说明使用场景。
2. Fork 仓库并从最新的 `main` 分支创建工作分支。
3. 保持改动范围聚焦；修改 `ECSX-Gui/` 后重新构建前端，并在提交前运行 `corepack yarn test`。
4. 创建 Pull Request，说明修改目的、验证方式和可能影响；界面变更请附前后截图。

报告缺陷时，建议提供应用版本、Windows 版本、复现步骤、预期结果、实际结果，以及与问题相关的日志或截图。请勿在 Issue 中提交包含个人课表或其他敏感信息的文件。

## 隐私

应用无需账号或云端服务，课表、设置和日志保存在本地设备。启用更新检查时，应用会访问 GitHub Releases 或用户选择的更新代理，但不会上传课表内容。

## 致谢

本项目基于 [ElectronClassSchedule](https://github.com/EnderWolf006/ElectronClassSchedule)（ECS V1）重构开发，感谢原作者及所有贡献者。

## 许可证

本项目基于 [GNU General Public License v3.0](./LICENSE) 发布。使用、修改或分发本项目时，请遵守许可证条款。
