<p align="center">
  <img src="src/image/icon.png" width="128" alt="电子课表" />
</p>

<h1 align="center">Electron Class Schedule X</h1>
<p align="center">
  一个基于 Electron 的桌面课程表应用，支持单双周轮换、窗口置顶与穿透，专为 Windows 平台打造。
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
- **图形化课表编辑器** - 在仪表盘中编辑科目、时间表、每日课表和样式，保存后立即应用
- **单双周轮换** - 可按学期起始日期自动判断单双周，也可留空后手动选择
- **临时调课与调休** - 支持仅对当前运行生效的临时换课，以及当天切换其他星期日程
- **可选窗口置顶** - 默认保持在桌面上方，也可在设置中关闭
- **点击穿透与自动隐藏** - 工具条不拦截下层窗口操作，指针碰到主体时会暂时隐藏
- **上课倒计时** - 上课隐藏主体时可显示并拖动迷你倒计时
- **定时关机** - 支持添加、启停和删除多个关机时间，并在执行前提醒
- **在线更新** - 支持启动后自动检查、手动检查、下载并重启安装更新
- **本地优先** - 无需账号或云服务，课表显示与编辑均可离线使用

## 安装

从 [Releases](https://github.com/Enigfrank/ElectronClassScheduleX/releases) 页面下载最新 `Setup.<版本号>.exe` 安装包，双击运行即可。

> 首次运行时 Windows SmartScreen 可能会弹出警告，请点击 **"更多信息" → "仍要运行"**。这是未签名应用在 Windows 上的正常行为。

## 快速开始

1. 首次运行会显示“首次使用引导”。默认课表配置此时已经自动创建，无需手动准备文件。
2. 阅读引导后点击 **“完成并重启”**，程序会保存状态并自动重新启动。
3. 在 Windows 通知区域中单击课表托盘图标，或右键图标选择 **“打开配置界面”**。
4. 在仪表盘左侧进入 **“课表编辑器”**，配置课表后点击 **“保存配置并应用”**。
5. 顶部工具条会立即重新加载新课表。以后需要管理课表时仍从系统托盘进入仪表盘。

## 使用指南

### 编辑长期课表

“课表编辑器”会自动读取当前正在使用的配置。建议按以下顺序填写：

1. **基础设置**：设置倒计时目标；填写学期起始日期可启用自动单双周。
2. **科目名称**：维护课程简称与完整名称，例如简称 `语` 对应完整名称 `语文`。
3. **时间表**：为普通上课日、周末等日程类型设置时间段和课程序号。课程序号从 `0` 开始，`0` 表示每日课表中的第 1 节，`1` 表示第 2 节；结束时刻按包含端点计算，例如 40 分钟课程填写 `08:00-08:39`。
4. **每日课表**：必须保留 7 项，并按 **星期日 → 星期六** 的固定顺序排列；星期名称只用于显示。为每一天绑定时间表类型，并按节次填写科目简称。
5. **分隔线与样式配置**：按需调整，普通使用可以保留默认值。
6. 点击 **“保存配置并应用”**。配置校验通过后才会覆盖本地文件并重新加载顶部工具条。

编辑器顶部还提供导入和导出：导入只会把外部配置载入编辑器，需要再次保存才会覆盖当前课表；导出会把当前编辑内容保存为一个外部 `scheduleConfig.js` 备份。

### 单双周课程

- 在 **“基础设置 → 学期起始日期”** 中选择日期后，该日期开始的第一个 7 天按单周计算，之后每 7 天自动切换一次。
- 学期起始日期留空时，仪表盘“功能选项”会显示 **“手动单周”** 和 **“手动双周”**。
- 在“每日课表”的课程输入框中使用逗号分隔两个科目简称，例如 `语,数`，会生成单双周轮换课程。中文逗号 `，` 和顿号 `、` 也可以使用。

### 临时调整与常用操作

| 入口 | 用途 | 生效范围 |
| :--- | :--- | :--- |
| 功能选项 → 配置课表 | 临时替换某一节课程，不修改课表文件 | 内存临时状态，重启、重新应用配置或手动切换周次后清除 |
| 功能选项 → 切换日程 | 调休时让今天临时使用其他星期的课表 | 保存在本机；星期变化时自动重置，也可在选项中手动重置 |
| 功能选项 → 矫正计时 | 调整课表计时偏移 | 持续生效，直到再次修改 |
| 功能选项 → 管理定时关机 | 添加、启停或删除关机时间 | 当前已调度计划 |
| 设置选项 | 控制课上计时、窗口置顶、上课隐藏和开机启动 | 保存到本机设置 |
| 在线更新 | 检查、下载并重启安装新版本，也可测试更新代理 | 仅更新流程 |

持久修改必须使用左侧 **“课表编辑器”**。临时调课只保存在运行内存中，重新应用长期配置、重建工具条、重新启动程序或手动切换单双周后会消失。“切换日程”当前按星期变化判断自动重置，使用完毕后主动选择“重置”最稳妥。

### 顶部工具条与系统托盘

- 顶部工具条用于被动显示课程，不提供点击打开设置的交互；鼠标操作会穿透到下面的窗口。
- 指针碰到工具条主体时，工具条会立即隐藏，并在停止触发约 2.5 秒后恢复。
- 开启“上课隐藏”和“课上计时”时，上课期间会显示可拖动的迷你倒计时。
- 关闭仪表盘窗口不会退出程序，顶部课表和托盘仍会运行。需要完全退出时，请使用仪表盘“退出程序”或托盘右键菜单中的“退出程序”。
- 可在 **“设置选项 → 高级设置 → 重新运行引导”** 再次打开首次使用引导。

### 本地数据与备份

课表配置文件位于：

```text
%APPDATA%\electron-class-schedule-x\config\scheduleConfig.js
```

普通用户应优先使用课表编辑器。直接编辑配置文件适合高级修改或故障排查；备份和迁移建议使用编辑器的导出、导入功能。

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

本应用无需账号或云端服务，课表、设置和日志保存在用户本地设备中，课表显示与编辑可离线使用。启用更新检查时，应用会访问 GitHub Releases 或用户选择的更新代理，但不会上传课表内容。

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
