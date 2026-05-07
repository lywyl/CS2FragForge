# CS2demo_cutter — 当前开发状态

**最后更新**: 2026-05-05
**版本**: v3.1
**状态**: 开发中 — POV 默认关闭 + 校准范围修复，待 E2E 手动测试

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
2. **Project 页** — 自动检测 highlights（3K/4K/ACE/Clutch/Eco）+ POV 回放数据 + 一键录制
3. **Recording 页** — Per-clip OBS WebSocket 录制（OBS 连接 → 场景配置 → CS2 启动 → GSI 校准 → Space 预热 → per-clip 独立录制 → POV 回放段）
4. **Editor 页** — 视频播放 + 裁剪（In/Out 点 + 帧步进）+ 音频轨道导入 + 时间线编辑
5. **Export 页** — FFmpeg 导出（裁剪 → 合并 → 音频混合），支持取消和进度条
6. **Settings 页** — 设置持久化（electron-store）+ CS2 路径自动检测 + 受控组件 + 重置默认值 + Toast 通知
7. **Toast 通知系统** — 全局通知，支持 success/error/warning/info，自动关闭
8. **CS2 黄色主题** — 全应用 CS2 风格暗色主题（金色/深灰配色方案）
9. **用户配置保护** — 录制前快照 config.cfg/video.txt，录制后自动恢复

### 下一步应该做什么
见下方"待完成阶段"，**推荐优先级**：
1. **E2E 手动测试** — 用真实 demo + OBS + CS2 验证完整录制流程
2. **Phase 6 AI 评分**（可选）— OpenAI/Claude API 集成

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

### Phase 2: CS2 录制管线 ✅ (v3.0 — Insight Agent 完整移植)
- `RecordingOrchestrator`: Per-clip OBS 录制编排器（OBS 连接 → 场景配置 → CS2 启动 → GSI 就绪 → **smart 校准** → per-clip StartRecord/StopRecord → POV 回放段 → cleanup）
- `OBSService`: OBS WebSocket v5 服务（连接/断开、场景管理、Game Capture 自动创建、录制控制、**PauseRecord/ResumeRecord**、连接测试、陈旧录制预检）
- `cs2-config-backup`: 用户配置保护（录制前快照 config.cfg/video.txt/user_convars_*.vcfg，录制后恢复）
- `CfgWriter`: 启动 CFG + GSI CFG 生成器（playdemo + GSI allplayers 数据请求，`fps_max 500`）
- `DemoLauncher`: CS2 进程管理（复制 demo、1920x1080 全屏启动、`quit` 控制台命令退出 + taskkill 后备，**移除 -nosound**）
- `gsi-ready`: CS2 Game State Integration 服务（本地 HTTP 接收 GSI 心跳、就绪检测、allplayers slot 校准、**fresh steamid 检测**）
- `win-console-inject`: PowerShell + C# 控制台注入（PostMessage WM_CHAR 绕过 UIPI、VK_OEM3 打开控制台、批量命令序列、**sendSpaceTaps 不打开控制台的 Space 键注入**）
- **录制方案 (v3.0)**：CS2 启动一次 → GSI 就绪 → smart 校准（seek 到击杀 tick + 限 slot 数 + 提前终止）→ 每 clip 独立 OBS StartRecord/StopRecord → Space 预热 → 单次合并注入（demo_pause → gototick → resume → spec_mode → spec_player → hideconsole）→ POV 回放段（OBS PauseRecord → seek victim → spec → OBS ResumeRecord → replay）
- **spec_player 校准**: 优先级：GSI calibrated slot（seek 到击杀 tick 校准 + 提前终止）→ Python Phase 2 精炼 slot（在击杀 tick 重建 spec_slot_map）→ player name 回退
- **POV 回放**: 多杀高光（3K+）自动在 victiim 死亡时刻切换视角，OBS PauseRecord/ResumeRecord 在一个文件内生成干净剪辑点
- **引擎空转补偿**: 1.5s × tickRate 提前 seek，补偿注入耗时
- **Session warmup cvar**: 首 clip 注入 cl_draw_only_deathnotices/spec_show_xray/hud_showtargetid/tv_nochat
- RecordingPage: 完整录制 UI（自动开始、进度条、highlight 状态列表、取消、完成/错误状态）+ 传递 OBS 配置 + killDetails
- SettingsPage: OBS WebSocket 配置（host/port/password + 测试连接按钮）
- IPC: RECORDING_START/STOP/PROGRESS + OBS_TEST_CONNECTION 通道 + preload 桥接
- Store: recordingStatus/recordingProgress/recordingResult 状态管理

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
| `src/python/main.py` | FastAPI 入口，4 个端点，**Phase 2 精炼 spec slot + victim slot** |
| `src/python/models.py` | Pydantic 数据模型（含 **KillDetail** POV 数据） |
| `src/python/services/parser_service.py` | Demo 解析器，**spec_player slot 计算 + 偏移检测** |
| `src/python/services/highlight_detector.py` | Highlights 检测器，**含 victim 信息收集** |
| `src/python/requirements.txt` | 运行时依赖 |

### 主进程 (Electron)
| 文件 | 说明 |
|------|------|
| `src/main/index.ts` | 主进程入口，IPC handlers，Python API 代理 |
| `src/main/python-bridge.ts` | Python 进程管理，路径解析，健康检查 |
| `src/main/ffmpeg.ts` | FFmpeg/FFprobe 路径解析 |
| `src/main/export-service.ts` | FFmpeg 导出服务（trim/concat/audio mix/progress/cancel） |
| `src/main/recording-orchestrator.ts` | **Per-clip 录制编排器**（smart 校准 + 合并注入 + POV 回放 + 引擎空转补偿 + 配置保护） |
| `src/main/obs-service.ts` | OBS WebSocket v5（+ **PauseRecord/ResumeRecord**） |
| `src/main/cfg-writer.ts` | CS2 CFG 文件生成（`fps_max 500`） |
| `src/main/demo-launcher.ts` | CS2 进程管理（**移除 -nosound**） |
| `src/main/gsi-ready.ts` | CS2 GSI 服务（心跳接收、就绪检测、slot 校准） |
| `src/main/win-console-inject.ts` | 控制台注入（+ **sendSpaceTaps 不打开控制台**） |
| `src/main/cs2-config-backup.ts` | **用户配置快照/恢复（config.cfg 等保护）** |
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
| `src/shared/ipc.ts` | IPC 通道常量 |
| `src/shared/export-types.ts` | 导出相关共享类型 |
| `src/shared/recording-types.ts` | 录制类型（+ **KillDetail** + RecordingStatus 补全 loading-demo/preparing-record） |
| `src/shared/settings-types.ts` | 设置相关共享类型 |
| `src/preload/index.ts` | electronAPI 桥接 |

### 渲染进程 (React)
| 文件 | 说明 |
|------|------|
| `src/renderer/src/types/project.ts` | TypeScript 类型（+ **KillDetail** for POV） |
| `src/renderer/src/pages/WelcomePage.tsx` | 拖放 demo（+ **killDetails 映射**） |
| `src/renderer/src/pages/RecordingPage.tsx` | 录制页（+ **killDetails 传递**） |

### 配置 & 脚本
| 文件 | 说明 |
|------|------|
| `electron-builder.json5` | 打包配置 + extraResources |
| `prepare-python-embed.ps1` | 嵌入式 Python 准备脚本 |

---

## 测试结果

| 类别 | 数量 | 状态 |
|------|------|------|
| JS/TS 单元测试 (Vitest) | 88 | ✅ 全部通过 |
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
| P0 | Phase 2.5 | 2d | ✅ 完成 | OBS WebSocket 集成（替代 startmovie，含自动场景配置 + 单次会话连续录制 + FFmpeg 切割） |
| P0 | Phase 2.4 | 1d | ✅ 完成 | 录制编排状态机 (RecordingOrchestrator) |
| P0 | Phase 3.4 | 0.5d | ✅ 完成 | 录制页 UI（自动开始+进度+状态列表+取消+完成） |
| P2 | Phase 6 AI 评分 (可选) | 2d | ⬜ 待开始 | OpenAI/Claude API 集成 |

### 已知待修复
- 视频播放区域仍偏大，用户希望进一步缩小（延后处理）
- POV 回放段切回杀手视角有时序问题，已默认关闭 (POV_ENABLED=false)
- Smart jump-cut（>12s 击杀间隔分段录制）未实现
- 批量多 demo 录制未实现

### 已修复 Bug 记录 (v3.1 新增)

| Bug | 根因 | 修复方式 | 日期 |
|------|------|----------|------|
| 镜头显示被击杀玩家而非杀手 | POV 回放段在受害者视角后未正确切回；校准扫 slot 太少找不到玩家 | 禁用 POV (POV_ENABLED=false)；校准扫 min(10, playerCount+2) slot | 2026-05-05 |

### 已修复 Bug 记录 (v3.0)
| Bug | 根因 | 修复方式 | 日期 |
|------|------|----------|------|
| 视角不切换到击杀者 | 两阶段 PowerShell 注入间有 1-3s 延迟（进程重启+C#重编译），demo 在此间隙以错误视角播放 | 合并为单次 PowerShell 调用（零 gap）+ 增加 SPEC_SETTLE/RESUME/POST_HIDE 延迟 | 2026-05-05 |
| demo_pause 翻转 (toggle) | demo_pause 是翻转命令非强制暂停，已暂停时再次注入会取消暂停 | 状态机重设计：校准结束不放 pause，clip 间隙不放 pause，确保每次 toggle 作用于正确状态 | 2026-05-05 |
| 引擎空转导致录制晚到 | 注入耗时（resume + spec + hideconsole）在 demo 播放中消耗时间 | 添加 ENGINE_BURN_SEC=1.5s 补偿，提前 seek | 2026-05-05 |
| 校准慢且扫满 16 slot | tick ~0 无 seek + 盲扫所有 slot | seek 到击杀 tick + 限 playerCount+2 slot + 提前终止 | 2026-05-05 |
| spec slot 在热身阶段不准 | Python spec_slot_map 在固定 tick 64 构建 | Phase 2 精炼：每个高光在首杀 tick 重建 spec_slot_map | 2026-05-05 |
| 无 POV 回放段 | 缺少 kill_details 数据 + OBS 无 PauseRecord/ResumeRecord | Python 端收集 victim 信息 + OBS Pause/Resume + orchestrator POV 段循环 | 2026-05-05 |
| 无用户配置保护 | CS2 可能将 fps_max/hud 等 cvar 持久化到用户 config.cfg | cs2-config-backup.ts: 录制前快照 + 录制后恢复 | 2026-05-05 |
| -nosound 导致无游戏音频 | CS2 启动参数包含 -nosound | 移除 -nosound 标志 | 2026-05-05 |
| fps_max 30 太卡 | 默认 30 FPS 限制 | 改为 500 | 2026-05-05 |
| RecordingStatus 类型不完整 | loading-demo/preparing-record 不在类型定义中 | 补全 RecordingStatus 联合类型 | 2026-05-05 |

### 已修复 Bug 记录 (历史)
| Bug | 根因 | 修复方式 | 日期 |
|------|------|----------|------|
| 导出卡 0% 不动 | `ffprobe-static` 未安装 + 模块导入格式错误 | `npm install ffprobe-static` + 修复 `require()` 类型转换 | 2026-04-30 |
| 导出进度不更新 | `progress.percent` 常为 undefined | timemark 回退计算 + 60s watchdog 定时器 | 2026-04-30 |
| ClipEditor 按钮被遮挡 | 视频区域 `flex-1` 无限制扩展 | `max-h-[60%]` + 居中布局 | 2026-04-30 |
| 拖放 .dem 文件无效 | Electron 33 移除了 `File.path` | preload 添加 `webUtils.getPathForFile()` + WelcomePage 使用新 API | 2026-04-30 |
| 选择文件后 fetch failed | `.venv` 不存在，系统 Python 缺少依赖 | 创建 `.venv` + 安装 uvicorn/fastapi/demoparser2 + `callPythonAPI` 添加 3 次重试 | 2026-04-30 |
| cs2FindPath 返回类型错误 | preload 类型声明为 `string \| null`，实际返回对象 | 修正为完整 envInfo 对象类型 | 2026-04-30 |
| startmovie 录制失败 | CS2 不执行 +exec CFG 脚本，autoexec.cfg 也不生效 | 改用 OBS WebSocket 录制方案 | 2026-04-30 |
| RecordingPage 缺少 obsConfig | 重构时遗漏 obsConfig 字段，录制请求无法传递 OBS 连接参数 | RecordingPage 添加 obsConfig 读取 settings | 2026-05-01 |
| 录制取消/错误后资源泄漏 | cancelResult() 和 catch 块不调用 cleanup()，OBS/CS2 进程未清理 | 添加 finally 块统一清理 + cancel() 停止 OBS + 幂等 cleanup | 2026-05-01 |
| orchestrator 测试失败 | fs/promises mock 缺少 default 导出 + 测试未推进 fake timers | 修复 mock + 添加 advanceTimersByTimeAsync | 2026-05-01 |
| PowerShell 注入路径错误 | `\v` 在 JS 模板字面量中被解释为垂直制表符 (0x0B) | `\\v` 转义为字面量 `\v` | 2026-05-05 |
| CS2 启动分辨率 1280x720 | demo-launcher.ts 硬编码 `-windowed -w 1280 -h 720` | 改为 `-fullscreen -w 1920 -h 1080` | 2026-05-05 |
| OBS 不自动录制 | 已有录制会话时 `StartRecord` 抛出 "output already active" | `GetRecordStatus` 预检 + 停止陈旧录制 | 2026-05-05 |
| spec_player 不切换视角 | 发送 64 位 Steam ID 而非 engine user_id | 添加 `user_id` 到 demoparser2 props + 全栈传递 player_userid | 2026-05-05 |
| CS2 录制后不退出 | `proc.kill('SIGTERM')` 对 Windows GUI 应用无效 | 注入 `quit` 控制台命令 + taskkill 后备 | 2026-05-05 |
| 校准跳到 demo 开头 | calibrateSpecSlots seek 到 tick 0 | 移除 seek，直接读取当前 GSI allplayers 数据 | 2026-05-05 |
| demo 稳定等待太久 | 固定等待 8 秒 | 减少到 2 秒，校准步骤隐式等待 GSI 数据 | 2026-05-05 |

---

## 七、最终实现效果

### 录制流程（v3.1）

选中 N 个高光 → 点击 Record：

```
1. OBS 连接 + 场景配置
2. Demo 复制 + CFG 写入 + GSI 启动
3. 用户配置快照 (config.cfg / video.txt)
4. CS2 启动 (1920x1080, fps_max 500, 有声音)
5. GSI 就绪检测 → 8s 稳定
6. 校准: seek 到击杀 tick → 扫 min(10, playerCount+2) slot → 找到所有高光玩家
7. ┌─ 每 clip ──────────────────────────────────────────┐
   │ Space 预热 → 合并注入(单次PS,零间隙):
   │   [首clip: warmup cvar] → demo_pause → gototick
   │   → demo_resume → spec_mode 5 → spec_player <slot>
   │   → hideconsole
   │ → OBS StartRecord → 等待(~12s, 镜头锁定杀手)
   │ → OBS StopRecord → rename → clips/<name>_<type>_R<round>_<id>.mp4
   └─────────────────────────────────────────────────────┘
8. 最后 clip 后: 注入 quit → CS2 退出
9. 恢复用户配置 → 删除临时文件 → OBS 断开
```

### 核心特性

| 特性 | 状态 |
|------|------|
| Per-clip 独立录制 (无 FFmpeg 切割) | ✅ |
| 镜头全程锁定高光玩家 (不跳受害者) | ✅ POV_ENABLED=false |
| 单次合并注入 (demo_pause→gototick→resume→spec→hideconsole) | ✅ |
| 引擎空转补偿 (1.5s × tickRate) | ✅ |
| Smart 校准 (seek 到击杀 tick + min 10 slot + 提前终止) | ✅ |
| Python Phase 2 精炼 (击杀 tick 重建 spec_slot_map) | ✅ |
| Session warmup cvar (首 clip: deathnotices/xray/targetid/nochat) | ✅ |
| 用户配置保护 (快照 + 恢复) | ✅ |
| 游戏音频 (移除 -nosound) | ✅ |
| fps_max 500 | ✅ |
| Space 预热 (demo UI priming, 不打开控制台) | ✅ |
| POV 回放段 (代码保留, 默认关闭) | ⏸️ |

### 与 Insight Agent 对照

| 特性 | 对齐 |
|------|:---:|
| _prepare_clip_playback: seek + spec + hideconsole 时序 | ✅ |
| _execute_single_clip_recording: per-clip StartRecord/StopRecord | ✅ |
| build_smart_jump_segments: 击杀间隔分段 | ❌ |
| POV victim segments | ⏸️ |
| cs2_config_backup: 用户配置保护 | ✅ |
| _recording_warmup_console_lines: session cvar | ✅ |
| send_cs2_space_taps: Space 预热 | ✅ |
| _calibrate_spec_players_for_demo: GSI 校准 | ✅ |
| ENGINE_BURN compensation | ✅ |
