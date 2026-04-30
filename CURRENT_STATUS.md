# CS2demo_cutter — 当前开发状态

**最后更新**: 2026-04-30
**版本**: v2.2
**状态**: 开发中 — 录制方案切换：startmovie → OBS WebSocket

## 快速开始（给新开发者）

### 环境要求
- Node.js 20+, npm
- Python 3.11+（自动使用项目 `.venv`）
- FFmpeg/FFprobe 通过 `ffmpeg-static`/`ffprobe-static` 自动安装

### 启动
```bash
npm install
npm run dev        # 启动 Electron + Vite 开发服务器
```

### 当前可用功能
1. **Welcome 页** — 拖放/选择 `.dem` 文件或导入视频
2. **Project 页** — 自动检测 highlights（3K/4K/ACE/Clutch/Eco）+ 一键录制
3. **Recording 页** — OBS WebSocket 自动录制（OBS 自动配置场景 → CS2 启动 → OBS 录制 → FFmpeg 切割）
4. **Editor 页** — 视频播放 + 裁剪（In/Out 点 + 帧步进）+ 音频轨道导入 + 时间线编辑
5. **Export 页** — FFmpeg 导出（裁剪 → 合并 → 音频混合），支持取消和进度条
6. **Settings 页** — 设置持久化（electron-store）+ CS2 路径自动检测 + 受控组件 + 重置默认值 + Toast 通知
7. **Toast 通知系统** — 全局通知，支持 success/error/warning/info，自动关闭
8. **CS2 黄色主题** — 全应用 CS2 风格暗色主题（金色/深灰配色方案）

### 下一步应该做什么
见下方"待完成阶段"，**推荐优先级**：
1. **Phase 2.5 OBS 录制集成** — 用 OBS WebSocket 替代 startmovie（方案已设计，待实现）
2. **E2E 手动测试** — 用真实 demo 验证完整录制流程
3. **Phase 6 AI 评分**（可选）— OpenAI/Claude API 集成

---

## 已完成阶段

### Phase 0: 项目脚手架 ✅
- Electron 33 + Vite + React 18 + TypeScript + Tailwind CSS + Zustand
- Python 3.11 venv + FastAPI + demoparser2
- electron-builder 打包配置
- Vitest (9→15 JS tests) + pytest (24 Python tests)

### Phase 1: Python 后端核心 ✅
- `ParserService`: demo 解析，tick rate 推断，事件提取，数据清洗
- `HighlightDetector`: 3K/4K/ACE, clutch 1v2~1v5, eco win 检测 + 评分排序
- FastAPI endpoints: `/health`, `/parse_demo`, `/detect_highlights`, `/game_info`
- 24 pytest tests, 85% coverage
- 用真实 demo 验证：检测到 13 个 highlights

### Phase 2: CS2 录制管线 ✅ (部分完成，录制方案切换中)
- `RecordingOrchestrator`: 录制状态机，协调 CFG 生成 → CS2 启动 → 录制等待 → 终止 → 文件移动
- `CfgWriter`: 生成 CS2 CFG 文件（demo_gototick + spec_player）
- `DemoLauncher`: CS2 进程管理（复制 demo 到 replays、启动、终止、已有进程清理）
- `ConsoleLogWatcher`: console.log 轮询监听（500ms 间隔，检测 demo 加载状态，30s 超时 fallback）
- `VideoPostProcessor`: MP4 文件验证/移动/清理
- ~~录制方案：`startmovie h264`~~ → **已废弃**，startmovie 不可靠（CS2 不执行 CFG 脚本）
- **新方案：OBS WebSocket v5** — CS2 只启动一次，OBS 连续录制所有 highlights，FFmpeg 切割为独立片段
  - `OBSService`（待实现）：连接 OBS、自动配置录制场景（CS2 窗口捕获）、开始/停止录制
  - 自动配置：创建 "CS2FragForge" 场景 + Game Capture 源捕获 CS2 窗口
  - 单次会话：生成组合 autoexec.cfg（含 wait 命令序列），CS2 启动一次完成所有 highlights
  - FFmpeg 切割：根据时间戳将 OBS 录制文件切割为独立片段
- RecordingPage: 完整录制 UI（自动开始、进度条、highlight 状态列表、取消、完成/错误状态）
- ProjectPage: "录制精彩时刻"按钮接通 onClick → 导航到 RecordingPage
- IPC: RECORDING_START/STOP/PROGRESS 通道 + preload 桥接
- Store: recordingStatus/recordingProgress/recordingResult 状态管理
- 16 个新测试（cfg-writer 7 + orchestrator 4 + store 5）

### Phase 5.1: 打包配置修复 ✅
- `electron-builder.json5`: extraResources 配置打包 Python 源码和 embed
- `python-bridge.ts`: 支持 embedded Python → 系统 Python → .venv 三级查找
- `ffmpeg.ts`: 修复 ffprobe 路径解析（`ffprobe-static` 导出 `{ path }` 对象）
- `prepare-python-embed.ps1`: 自动下载嵌入式 Python 脚本

### Phase 2.1: 环境发现 ✅
- `SteamRegistry`: 读取 Windows 注册表查找 Steam 安装路径
- `CS2PathResolver`: CS2 路径发现 + 验证 + replays 目录 + Steam 用户 ID
- 支持 HKCU → HKLM → 常用路径三级 fallback
- 支持 libraryfolders.vdf 多盘游戏库

### Phase 3.1: 前端基础设施 ✅
- react-router-dom 路由配置（6 个路由）
- lucide-react 图标库替换 emoji
- SidebarNav 激活态 + 项目状态显示
- 窗口尺寸调整为 1280×800（视频编辑友好）
- ErrorBoundary 全局错误捕获

### Phase 3.2: Welcome 页 ✅
- 拖放区域实现（onDrop + 视觉反馈）
- "Open Demo File" 按钮 + IPC 绑定
- "Import Video File" 按钮 + 本地 MP4 导入
- Python 后端自动启动 + demo 解析 + highlights 检测
- 解析完成后自动跳转 Project 页

### Phase 3.3: Project 页 ✅
- Demo 信息展示（地图名、tick rate、玩家数量）
- Highlights 列表（类型筛选 + 排序 + 玩家过滤）
- 评分条可视化
- 类型 badge 颜色区分（3K/4K/ACE/Clutch/Eco）
- "开始录制"按钮 + 项目关闭

### Phase 3.5.9: ClipInspector ✅
- 片段属性面板：选中片段后显示详细属性并支持编辑
- 时间编辑：入点/出点可编辑输入框（M:SS.CC 格式）+ 帧级微调按钮（±1/30s）
- 音量调节：滑块 0-200% + 百分比显示
- 时长显示：自动计算 endSec - startSec（只读）
- 跳转功能：快速跳转到片段入点/出点
- 取消选中：关闭属性面板恢复空状态提示
- EditorPage 布局：Video → AudioTrackPanel → **ClipInspector** → ClipEditor → Timeline

### Phase 3.5.8: AudioTrackPanel ✅
- 音频轨道面板：导入音频文件、音量滑块（0-200%）、删除轨道
- 支持 mp3/wav/ogg/m4a/aac/flac 格式
- 与 ExportService 音频混合管线对接
- EditorPage 布局：Video → AudioTrackPanel → ClipEditor → Timeline

### Phase 3.5: 时间线编辑器 ✅ (v2 增强版)
- `VideoPlayer`: HTML5 视频播放器，`local-video://` 自定义协议加载本地文件
- 自定义控制条：播放/暂停、进度条、时间显示、音量滑块
- 键盘快捷键：Space（播放/暂停）、Left/Right（±5s 跳转）、`,`/`.`（帧步进 ±33ms）
- `ClipEditor`: 片段裁剪面板，Set In/Out 按钮 + 手动输入 + 帧级微调按钮 + Preview + Add to Timeline
- `Timeline`: 时间线可视化，彩色片段块、播放头同步、**点击定位**、**播放头拖拽**、删除、拖拽重排序
- **播放头位置修正**：非连续片段的正确时间映射（videoTimeToTimelinePos/timelinePosToVideoTime）
- **In/Out 范围标记**：进度条上显示入点/出点区间高亮
- **I/O 快捷键**：`I` 设入点、`O` 设出点
- **预览改进**：requestAnimationFrame 替代 setTimeout，更精准的出点停止
- **In/Out 状态提升**：由 EditorPage 统一管理，支持跨组件共享
- WelcomePage 新增视频导入入口
- Zustand store 新增 `updateClip`、`reorderClips`、`createProjectFromVideo` 操作

### Phase 4: 导出管线 ✅
- `ExportService`: FFmpeg 导出服务（trim → concat → audio mix）
  - 单片段裁剪：libx264 CRF 22 + AAC，支持可调参数
  - 多片段合并：concat demuxer + `-async 1` 防音画偏移
  - 音频混合：complex filter amix，支持多音轨音量控制
  - 进度回调：通过 `webContents.send` 实时推送进度到 renderer
  - 取消支持：FFmpeg kill + 临时文件清理
- `ExportPage`: 完整导出 UI（导出前摘要/设置、导出中进度条、导出完成/错误状态）
- 导出设置：格式(MP4/MKV)、编码(H.264/H.265)、CRF(18-28)、分辨率、音频码率
- 项目持久化：save/load JSON，dialog + file I/O via IPC
- 共享类型：`ExportSettings`、`ExportProgress`、`ExportRequest` 等
- IPC 通道：`export:start/cancel/progress/selectOutput`、`project:save/load`
- 5 个 ExportService 单元测试 + 4 个 store export 状态测试

### Phase 3.4: 占位页面 ✅
- RecordingPage — Phase 2 录制管线占位

### Phase 5.2: 设置持久化 + Toast 系统 ✅
- `electron-store`: 主进程设置持久化（`src/main/settings-store.ts`）
- `useSettingsStore`: Zustand 渲染进程设置状态管理
- SettingsPage 完全重写: 受控组件 + 加载/错误状态 + 重置确认
- Toast 通知系统: `useToastStore` + `ToastContainer` 组件
- IPC 通道: `settings:get/set/reset`
- 设置项: language, cs2InstallPath, preRoll, postRoll
- CS2 路径自动检测按钮（调用 `CS2PathResolver.findCS2Path()`）
- 待添加: OBS WebSocket 连接设置（host/port/password + 测试连接按钮）

### Phase 5.3: UI 美化 (CS2 黄色主题) ✅
- Tailwind 配置: CS2 色彩体系（deep/surface/elevated/gold/text-muted）
- 全局 CSS: CSS 自定义属性主题 token
- SidebarNav: 金色激活态 + 深色背景
- TitleBar: 金色底边 + 深色背景
- 所有页面组件: 统一 CS2 暗色主题配色
- 新增 i18n 键: settings.saved, settings.reset, toast.success/error/warning/info 等

### CI/CD ✅
- `.github/workflows/ci.yml`: lint → test → build-windows 三阶段流水线
- `lefthook.yml`: pre-commit 新增 `npm run test`

### i18n: 中英文切换 ✅
- 轻量自研 `useTranslation` hook + React Context
- 114 个 UI 字符串提取到 `en.ts`/`zh.ts` 字典
- 所有 11 个组件/页面文件已中文化
- SettingsPage 新增语言切换按钮（中文/English）
- 默认中文，`localStorage` 持久化语言选择
- 插值语法 `{param}` 支持动态值
- ErrorBoundary（class 组件）使用 `static contextType` 接入

---

## 当前文件清单

### 后端 (Python)
| 文件 | 说明 |
|------|------|
| `src/python/main.py` | FastAPI 入口，4 个端点 |
| `src/python/models.py` | Pydantic 数据模型 |
| `src/python/services/parser_service.py` | Demo 解析器 |
| `src/python/services/highlight_detector.py` | Highlights 检测器 |
| `src/python/requirements.txt` | 运行时依赖 |

### 主进程 (Electron)
| 文件 | 说明 |
|------|------|
| `src/main/index.ts` | 主进程入口，IPC handlers，Python API 代理，`local-video://` 协议，导出+录制+项目持久化+设置持久化 handler |
| `src/main/python-bridge.ts` | Python 进程管理，路径解析，健康检查 |
| `src/main/ffmpeg.ts` | FFmpeg/FFprobe 路径解析 |
| `src/main/export-service.ts` | FFmpeg 导出服务（trim/concat/audio mix/progress/cancel） |
| `src/main/recording-orchestrator.ts` | 录制编排器（状态机，协调 OBS 录制 + CS2 启动/终止） |
| `src/main/obs-service.ts` | OBS WebSocket v5 客户端（连接/自动配置场景/录制控制） |
| `src/main/cfg-writer.ts` | CS2 CFG 文件生成（demo_gototick + spec_player + 组合 autoexec） |
| `src/main/demo-launcher.ts` | CS2 进程管理（复制 demo、启动、终止） |
| `src/main/console-log-watcher.ts` | CS2 console.log 轮询监听（检测 demo 加载状态） |
| `src/main/video-post-processor.ts` | MP4 文件验证/移动/清理 |
| `src/main/cs2-path-resolver.ts` | Steam 注册表 + CS2 路径发现 + VDF 解析 |
| `src/main/settings-store.ts` | electron-store 设置持久化（get/set/reset） |

### 渲染进程 (React)
| 文件 | 说明 |
|------|------|
| `src/renderer/src/App.tsx` | 路由容器 + ToastContainer 集成 |
| `src/renderer/src/main.tsx` | 入口，包裹 I18nProvider |
| `src/renderer/src/i18n/index.tsx` | I18nProvider + useTranslation hook |
| `src/renderer/src/i18n/en.ts` | 英文字典（125+ 条） |
| `src/renderer/src/i18n/zh.ts` | 中文字典（125+ 条） |
| `src/renderer/src/components/SidebarNav.tsx` | 路由导航 + 项目状态（CS2 金色主题） |
| `src/renderer/src/components/TitleBar.tsx` | 自定义标题栏（CS2 金色主题） |
| `src/renderer/src/components/ErrorBoundary.tsx` | 全局错误边界（CS2 金色主题） |
| `src/renderer/src/components/VideoPlayer.tsx` | HTML5 视频播放器 + 自定义控制条 + 帧步进 + In/Out 范围标记 |
| `src/renderer/src/components/ClipEditor.tsx` | 片段裁剪面板（in/out points + 帧级微调 + I/O 快捷键联动） |
| `src/renderer/src/components/Timeline.tsx` | 时间线可视化 + 点击定位 + 播放头拖拽 + 拖拽排序 |
| `src/renderer/src/components/AudioTrackPanel.tsx` | 音频轨道面板（导入、音量、删除） |
| `src/renderer/src/components/ClipInspector.tsx` | 片段属性面板（时间编辑、音量、跳转） |
| `src/renderer/src/components/ToastContainer.tsx` | 全局 Toast 通知容器（固定定位 + 动画 + 自动关闭） |
| `src/renderer/src/pages/WelcomePage.tsx` | 拖放（webUtils）+ 文件选择 + 视频导入 + 后端联动（CS2 主题） |
| `src/renderer/src/pages/ProjectPage.tsx` | Highlights 列表 + 筛选排序（CS2 主题） |
| `src/renderer/src/pages/EditorPage.tsx` | 视频编辑器（lift state + I/O 快捷键 + rAF 预览）（CS2 主题） |
| `src/renderer/src/pages/RecordingPage.tsx` | 录制占位（CS2 主题） |
| `src/renderer/src/pages/ExportPage.tsx` | 导出页（片段摘要 + 设置 + 进度 + 完成状态）（CS2 主题） |
| `src/renderer/src/pages/SettingsPage.tsx` | 设置页（CS2 自动检测 + 受控组件 + 持久化 + Toast 通知 + CS2 主题） |
| `src/renderer/src/stores/useProjectStore.ts` | 项目状态管理 |
| `src/renderer/src/stores/useSettingsStore.ts` | 设置状态管理（Zustand + IPC） |
| `src/renderer/src/stores/useToastStore.ts` | Toast 通知状态管理（Zustand + 自动关闭） |
| `src/renderer/src/types/project.ts` | TypeScript 类型定义 |

### 共享 & 预加载
| 文件 | 说明 |
|------|------|
| `src/shared/ipc.ts` | IPC 通道常量（含导出+录制+项目持久化+设置持久化通道） |
| `src/shared/export-types.ts` | 导出相关共享类型（ExportSettings/Progress/Request） |
| `src/shared/recording-types.ts` | 录制相关共享类型（RecordingStatus/Progress/Request/Result） |
| `src/shared/settings-types.ts` | 设置相关共享类型（AppSettings/DEFAULT_APP_SETTINGS） |
| `src/preload/index.ts` | electronAPI 桥接（含导出+录制+项目持久化+设置持久化+文件工具方法） |

### 配置 & 脚本
| 文件 | 说明 |
|------|------|
| `electron-builder.json5` | 打包配置 + extraResources |
| `prepare-python-embed.ps1` | 嵌入式 Python 准备脚本 |

---

## 测试结果

| 类别 | 数量 | 状态 |
|------|------|------|
| JS/TS 单元测试 (Vitest) | 58 | ✅ 全部通过 |
| Python 后端测试 (pytest) | 24 | ✅ 全部通过 |
| ESLint 检查 | - | ⚠️ 7 pre-existing errors (无关文件) |
| TypeScript 编译 | - | ✅ 通过 |
| electron-vite 构建 | - | ✅ 通过 |
| GitHub Actions CI | - | ✅ 配置完成 (lint → test → build-windows) |

---

## 待完成阶段

| 优先级 | 阶段 | 预计工时 | 状态 | 说明 |
|--------|------|----------|------|------|
| P0 | Phase 3.5.9 | 0.5d | ✅ 完成 | ClipInspector 属性面板（选中片段的时长/音量/精确时间） |
| P1 | Phase 5.2 | 1d | ✅ 完成 | 设置持久化 (electron-store) + Toast 通知系统 |
| P1 | Phase 5.3 | 1d | ✅ 完成 | CS2 黄色主题 + 动画 + 响应式优化 |
| P1 | CI/CD | 0.5d | ✅ 完成 | GitHub Actions 流水线 + lefthook pre-commit test |
| P0 | Phase 2.2 | 1d | ✅ 完成 | CS2 控制 (CFG 生成 + 进程启动) |
| P0 | Phase 2.5 | 2d | 🔧 待实现 | OBS WebSocket 集成（替代 startmovie，含自动场景配置 + 单次会话连续录制 + FFmpeg 切割） |
| P0 | Phase 2.4 | 1d | ✅ 完成 | 录制编排状态机 (RecordingOrchestrator) |
| P0 | Phase 3.4 | 0.5d | ✅ 完成 | 录制页 UI（自动开始+进度+状态列表+取消+完成） |
| P2 | Phase 6 AI 评分 (可选) | 2d | ⬜ 待开始 | OpenAI/Claude API 集成 |

### 已知待修复
- 视频播放区域仍偏大，用户希望进一步缩小（延后处理）

### 已修复 Bug 记录
| Bug | 根因 | 修复方式 | 日期 |
|------|------|----------|------|
| 导出卡 0% 不动 | `ffprobe-static` 未安装 + 模块导入格式错误 | `npm install ffprobe-static` + 修复 `require()` 类型转换 | 2026-04-30 |
| 导出进度不更新 | `progress.percent` 常为 undefined | timemark 回退计算 + 60s watchdog 定时器 | 2026-04-30 |
| ClipEditor 按钮被遮挡 | 视频区域 `flex-1` 无限制扩展 | `max-h-[60%]` + 居中布局 | 2026-04-30 |
| 拖放 .dem 文件无效 | Electron 33 移除了 `File.path` | preload 添加 `webUtils.getPathForFile()` + WelcomePage 使用新 API | 2026-04-30 |
| 选择文件后 fetch failed | `.venv` 不存在，系统 Python 缺少依赖 | 创建 `.venv` + 安装 uvicorn/fastapi/demoparser2 + `callPythonAPI` 添加 3 次重试 | 2026-04-30 |
| cs2FindPath 返回类型错误 | preload 类型声明为 `string \| null`，实际返回对象 | 修正为完整 envInfo 对象类型 | 2026-04-30 |
| startmovie 录制失败 | CS2 不执行 +exec CFG 脚本，autoexec.cfg 也不生效 | 改用 OBS WebSocket 录制方案 | 2026-04-30 |

---

## 七、下一步行动

录制方案已从 startmovie 切换到 OBS WebSocket。推荐优先级：

| 优先级 | 任务 | 预计工时 | 前置条件 | 说明 |
|--------|------|----------|----------|------|
| **P0** | Phase 2.5 OBS 集成 | 2d | OBS Studio + obs-websocket-js | OBS WebSocket 自动配置场景 + 单次会话连续录制 + FFmpeg 切割 |
| **P0** | E2E 手动测试 | 0.5d | CS2 + demo + OBS | 验证完整录制流程：demo → highlights → OBS 录制 → MP4 |
| **P2** | Phase 6 AI 评分 (可选) | 2d | 无 | OpenAI/Claude API 集成 |

**开发者提示**：
- **录制使用 OBS WebSocket v5**（需安装 OBS Studio + 启用 WebSocket 服务器）
- npm 依赖：`npm install obs-websocket-js`
- 录制流程：CS2 启动一次 → OBS 连续录制所有 highlights → FFmpeg 切割为独立片段
- OBS 自动配置：应用自动创建 "CS2FragForge" 场景 + Game Capture 源
- 用户需在 OBS 中设置输出路径（设置 → 输出 → 录制 → 录像路径）
- 新增 i18n 字符串时，同时更新 `en.ts` 和 `zh.ts`（目前 140+ 条）
- Python 依赖安装：`python -m venv .venv && .venv/Scripts/pip install -r src/python/requirements.txt`
- 拖放文件使用 `webUtils.getPathForFile()`（Electron 33 不再支持 `File.path`）
