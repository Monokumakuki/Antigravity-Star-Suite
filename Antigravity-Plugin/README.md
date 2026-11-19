# 星语 · Antigravity Star Suite 原生插件（v0.3.0 / 适用 Antigravity 2.x）

**结论先行**：将星语猫娘桌宠与织梦壁纸皮肤打包为 Antigravity 原生插件（Sidecar + 侧栏控制面板），无需修改 Antigravity `app.asar` 或桌面快捷方式，自动更新不掉配置，同时支持选择本地 `.mp4` / `.webm` 视频与图片作为工作台背景。

## 核心特性

- **原生 Sidecar 托管**：随 Antigravity 启动自动运行 `star-suite` Sidecar，不再依赖独立系统自启监控。
- **桌宠伴随启停**：启用「随 Antigravity 启动自动唤起桌宠」后，自动调起本机已安装的 `StarWidget.exe`（自动清理 `ELECTRON_RUN_AS_NODE` 环境变量），并在侧栏面板提供唤起、启动、退出控制。
- **动态视频与自定义图片背景**：在内置 Gemini 角色设定集之外，支持选择本地 `.mp4`、`.webm`、`.png`、`.jpg`、`.jpeg`、`.webp`、`.gif` 文件；视频与大图通过本机 `127.0.0.1` 随机端口 + Token 鉴权流媒体服务（支持 HTTP `206` 分片加载）直出，不复制文件、不膨胀配置目录。
- **配置互通**：复用 `~/.antigravity-dream-skin/settings.json`，与独立桌面版织梦皮肤实时兼容。

## 安装与运行

### 前置条件

1. 已安装 Node.js 20+ 与 Antigravity 2.x（含全局 `sidecar_sdk`）。
2. 如需托管猫娘桌宠，请确保已安装星语桌宠挂件（默认读取 `HKCU\Software\AntigravityStarSuite\Widget\InstallPath` 或 `%LOCALAPPDATA%\Programs\AntigravityStarSuite\Widget\StarWidget.exe`），也可通过环境变量 `ANTIGRAVITY_STAR_WIDGET_PATH` 指定路径。

### 一键安装到本机 Antigravity 插件目录

在仓库根目录执行：

```powershell
npm run install:plugin
```

该命令将执行以下操作：

1. 将插件清单、Sidecar 与运行时精简文件复制至 `~/.gemini/config/plugins/antigravity-star-suite/`。
2. 在 `~/.gemini/config/config.json` 的 `plugins` 字段中注册并启用 `antigravity-star-suite`。

完成后重启 Antigravity，即可在插件面板（`AUX_PANE`）中打开 **「星语 & 织梦皮肤」** 进行可视化配置。

### 独立浏览器预览模式

无需启动 Antigravity 也可直接调试控制台界面：

```powershell
node Antigravity-Plugin/sidecars/star-suite/main.mjs
```

## 目录用途清单

- `plugin.json`：Antigravity 插件元数据声明。
- `assets/logo.svg`：插件图标。
- `sidecars/star-suite/sidecar.json`：Sidecar 进程与 `AUX_PANE` WebView 入口配置。
- `sidecars/star-suite/main.mjs`：Sidecar 主服务（整合 `HostController`、`LocalMediaServer`、`WidgetSupervisor` 与控制台 API）。
- `sidecars/star-suite/runtime-loader.mjs`：自包含 `runtime/` 与源码开发路径双模式加载器。
- `sidecars/star-suite/widget-supervisor.mjs`：桌宠查找、环境净化与进程托管模块。
- `sidecars/star-suite/media-picker.mjs`：跨平台系统文件选择框封装（Windows PowerShell WinForms / macOS AppleScript / Linux Zenity）。
- `sidecars/star-suite/web/`：Sidecar 前端控制面板（支持视频播放控制与拖拽调焦）。
- `tests/plugin.test.cjs`：插件清单、托管器、加载器、HTTP 接口与安装脚本单元测试。
