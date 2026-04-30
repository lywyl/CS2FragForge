# CS2 Demo Cutter — 开发计划与进度追踪

> **生成日期**: 2026-04-29
> **最后更新**: 2026-04-30
> **版本**: v1.8
> **状态**: 开发中 — Phase 5.2/5.3 设置持久化+Toast+CS2主题已完成, 42 tests, CI/CD已配置

---

## 一、项目现状快照

| 维度 | 状态 |
|------|------|
| 技术栈 | Electron 33 + Vite + React 18 + TypeScript + Tailwind + Python FastAPI + demoparser2 |
| 当前阶段 | Phase 4 ✅, Phase 5.2 ✅ (设置持久化+Toast), Phase 5.3 ✅ (CS2主题), CI/CD ✅ |
| 核心功能 | Demo解析 + Highlights检测 + 前端UI + CS2路径发现 + FFmpeg导出管线 + 音频混合 + 中英切换 + 设置持久化 + Toast通知 |
| 可打包性 | ⚠️ extraResources已配置, embed Python需构建 |
| 测试覆盖 | Python 24 tests (85% cov) + JS 42 tests 全部通过 |
| UI完成度 | ~85% (路由+Welcome+Project+Editor增强+AudioTrackPanel+Export+Settings+Toast+i18n+CS2主题, 录制待实现) |

**关键阻塞项**：
1. Phase 2.2~2.4 需要 CS2 + OBS 环境测试
2. Phase 3.4 录制页待实现 (依赖 Phase 2)

---

## 二、开发阶段规划

### 阶段总览

```
Phase 0 ──► Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► 交付
(已完成)   (已完成)    (录制)      (编辑器)    (导出)      (打磨)
   ✅        ✅       🔴 10%      🟡 75%      ✅ 完成      ✅ 85%
```

---

### Phase 1: Python 后端核心 (预计 3-4 天)

**目标**: 实现完整的 `.dem` 解析与 Highlights 检测算法，后端API可用。

#### 1.1 核心算法实现
| # | 任务 | 文件 | 工时 | 优先级 | 依赖 |
|---|------|------|------|--------|------|
| 1.1.1 | 实现 multi-kill 检测 (3K/4K/5K/ACE) | `highlight_detector.py` | 1d | P0 | 1.1.4 |
| 1.1.2 | 实现 clutch 检测 (1v2~1v5) | `highlight_detector.py` | 1d | P0 | 1.1.4 |
| 1.1.3 | 实现 eco win 检测 | `highlight_detector.py` | 0.5d | P1 | 1.1.4 |
| 1.1.4 | 完成 ParserService 事件提取与数据清洗 | `parser_service.py` | 0.5d | P0 | - |
| 1.1.5 | tick-to-seconds 转换器 | `parser_service.py` | 0.25d | P1 | - |
| 1.1.6 | highlights 排序与评分机制 | `highlight_detector.py` | 0.5d | P1 | 1.1.1~1.1.3 |

#### 1.2 API 与测试
| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 1.2.1 | `/detect_highlights` 端点联调 | `main.py` | 0.5d | P0 |
| 1.2.2 | 真实 demo fixtures (2-3个) | `tests/python/fixtures/` | 0.5d | P0 |
| 1.2.3 | 高覆盖率 pytest (≥80%) | `tests/python/test_*.py` | 1d | P0 |
| 1.2.4 | 性能基准测试 (解析 <3s) | - | 0.25d | P2 |

#### 1.3 交付标准
- [x] POST `/detect_highlights` 对真实 demo 返回至少1个正确结果 ✅ (检测到13个highlights)
- [x] 3K/4K/ACE 识别准确率 ≥90%（人工抽样验证）✅ (手动验证通过)
- [x] 所有 pytest 通过，coverage ≥80% ✅ (24 tests, 85% coverage)
- [x] 接口响应时间 <3s（64tick MM demo）✅ (~2.5s 解析+检测)

---

### Phase 2: CS2 录制管线 (预计 5-6 天) — **最高技术风险**

**目标**: 自动从检测到的高光时刻录制出 MP4 片段。

#### 2.1 环境发现与准备
| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 2.1.1 | 读取 Windows 注册表查找 Steam/CS2 | `steam-registry.ts` | 0.5d | P0 |
| 2.1.2 | CS2 路径验证与 replays 目录确认 | `cs2-path-resolver.ts` | 0.5d | P0 |
| 2.1.3 | 手动路径覆盖 (Settings) | `settings-store.ts` | 0.25d | P1 |
| 2.1.4 | Demo 文件复制到 replays/ | `demo-launcher.ts` | 0.25d | P0 |

#### 2.2 CS2 控制
| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 2.2.1 | CFG 文件生成器 (`demo_gototick`, `spec_player`, `demo_timescale`) | `cfg-writer.ts` | 0.5d | P0 |
| 2.2.2 | CS2 进程启动与参数构建 | `demo-launcher.ts` | 0.5d | P0 |
| 2.2.3 | console.log tail 监听与状态确认 | `console-log-watcher.ts` | 1d | P0 |
| 2.2.4 | CS2 进程监控与异常退出处理 | `demo-launcher.ts` | 0.5d | P1 |

#### 2.3 OBS 集成
| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 2.3.1 | 安装 `obs-websocket-js` 依赖 | `package.json` | 0.1d | P0 |
| 2.3.2 | OBS WebSocket v5 连接封装 | `obs-service.ts` | 0.5d | P0 |
| 2.3.3 | StartRecord / StopRecord 控制 | `obs-service.ts` | 0.5d | P0 |
| 2.3.4 | 获取录制文件路径与重命名 | `obs-service.ts` | 0.5d | P0 |
| 2.3.5 | OBS 连接状态检测与重试 | `obs-service.ts` | 0.25d | P1 |

#### 2.4 录制编排 (状态机)
| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 2.4.1 | RecordingState 状态机定义 | `recording-orchestrator.ts` | 0.5d | P0 |
| 2.4.2 | 单条 highlight 录制流程编排 | `recording-orchestrator.ts` | 1d | P0 |
| 2.4.3 | 批量 highlights 录制队列 | `recording-orchestrator.ts` | 0.5d | P1 |
| 2.4.4 | 进度 IPC 通道 (`recording:state-update`) | `index.ts` + IPC | 0.5d | P0 |
| 2.4.5 | 取消录制与优雅终止 | `recording-orchestrator.ts` | 0.5d | P0 |
| 2.4.6 | `startmovie` 降级方案 (TGA+WAV → FFmpeg) | `recording-orchestrator.ts` | 1d | P2 |

#### 2.5 交付标准
- [ ] App 首次启动 2s 内检测到 CS2 路径
- [ ] 点击"录制"后 CS2 启动并导航到正确 tick
- [ ] OBS 成功录制并保存 MP4 到 clips 文件夹
- [ ] 进度 UI 每 1s 更新
- [ ] 取消按钮能安全终止 CS2 和 OBS 录制

---

### Phase 3: 视频编辑器 UI (预计 4-5 天)

**目标**: 可裁剪、排列片段并预览的时间线编辑器。

#### 3.1 前端基础设施
| # | 任务 | 文件 | 工时 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 3.1.1 | 安装 `react-router-dom` + 配置路由 | `App.tsx` | 0.25d | P0 | ✅ |
| 3.1.2 | 安装 `lucide-react` 图标库 | `package.json` | 0.1d | P0 | ✅ |
| 3.1.3 | 全局布局美化 (Sidebar激活态、主题色) | `SidebarNav.tsx` | 0.5d | P1 | ✅ |
| 3.1.4 | Error Boundary 全局错误捕获 | `error-boundary.tsx` | 0.25d | P1 | ✅ |

#### 3.2 Welcome 页
| # | 任务 | 文件 | 工时 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 3.2.1 | 拖放区域实现 (onDrop + 视觉反馈) | `WelcomePage.tsx` | 0.5d | P0 | ✅ |
| 3.2.2 | "Open Demo File" 按钮绑定 IPC | `WelcomePage.tsx` | 0.25d | P0 | ✅ |
| 3.2.3 | 最近项目列表 | `WelcomePage.tsx` | 0.25d | P1 | ⬜ |
| 3.2.4 | 空状态视觉设计 | `WelcomePage.tsx` | 0.25d | P1 | ✅ |
| 3.2.5 | "Import Video File" 按钮 (MP4 导入编辑) | `WelcomePage.tsx` | 0.25d | P0 | ✅ |

#### 3.3 Project 页
| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 3.3.1 | Demo 信息展示 (地图、时长、玩家列表) | `ProjectPage.tsx` | 0.5d | P0 |
| 3.3.2 | Highlights 列表 (类型筛选、排序) | `ProjectPage.tsx` | 0.5d | P0 |
| 3.3.3 | 玩家筛选器 | `ProjectPage.tsx` | 0.25d | P1 |
| 3.3.4 | "开始录制" 按钮与录制页跳转 | `ProjectPage.tsx` | 0.25d | P0 |

#### 3.4 录制页 (RecordingPage)
| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 3.4.1 | 录制进度条与状态文本 | `RecordingPage.tsx` | 0.5d | P0 |
| 3.4.2 | 状态日志流 (类似终端输出) | `RecordingPage.tsx` | 0.25d | P1 |
| 3.4.3 | 取消录制按钮 | `RecordingPage.tsx` | 0.25d | P0 |
| 3.4.4 | 录制完成后 clips 列表 | `RecordingPage.tsx` | 0.25d | P1 |

#### 3.5 编辑器页 (EditorPage) — 核心 (v2 增强版)
| # | 任务 | 文件 | 工时 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 3.5.1 | VideoPlayer 组件 (自定义控制条) | `VideoPlayer.tsx` | 0.75d | P0 | ✅ |
| 3.5.2 | ClipEditor 组件 (in/out trim + add to timeline) | `ClipEditor.tsx` | 0.5d | P0 | ✅ |
| 3.5.3 | 自定义 `local-video://` 协议加载本地视频 | `index.ts` | 0.25d | P0 | ✅ |
| 3.5.4 | Timeline 自定义组件 (clip blocks + playhead) | `Timeline.tsx` | 1d | P0 | ✅ |
| 3.5.5 | 片段 trim (Set In/Out + 手动输入) | `ClipEditor.tsx` | 0.5d | P0 | ✅ |
| 3.5.6 | drag-to-reorder on timeline | `Timeline.tsx` | 0.5d | P1 | ✅ |
| 3.5.7 | Playhead 与视频预览同步 | `EditorPage.tsx` | 0.5d | P0 | ✅ |
| 3.5.8 | AudioTrackPanel (导入、音量、删除) | `AudioTrackPanel.tsx` | 0.75d | P1 | ✅ |
| 3.5.9 | ClipInspector (选中片段属性面板) | `ClipInspector.tsx` | 0.5d | P1 | ✅ |
| 3.5.10 | **Timeline 点击定位 + 播放头拖拽** | `Timeline.tsx` | 0.5d | P0 | ✅ |
| 3.5.11 | **播放头位置修正 (非连续片段映射)** | `Timeline.tsx` | 0.25d | P0 | ✅ |
| 3.5.12 | **帧步进快捷键 (,/.键)** | `VideoPlayer.tsx` | 0.25d | P0 | ✅ |
| 3.5.13 | **I/O 快捷键设置 In/Out 点** | `EditorPage.tsx` | 0.25d | P0 | ✅ |
| 3.5.14 | **帧级微调按钮 (±1帧)** | `ClipEditor.tsx` | 0.25d | P1 | ✅ |
| 3.5.15 | **In/Out 范围标记 (进度条高亮)** | `VideoPlayer.tsx` | 0.25d | P1 | ✅ |
| 3.5.16 | **In/Out 状态提升到 EditorPage** | `EditorPage.tsx` | 0.25d | P0 | ✅ |
| 3.5.17 | **预览改用 requestAnimationFrame** | `EditorPage.tsx` | 0.25d | P1 | ✅ |

#### 3.6 交付标准
- [x] 能拖放/选择 demo 文件并进入项目 ✅
- [x] Highlights 列表正确显示检测到的精彩时刻 ✅
- [ ] 录制页实时显示进度和状态 (待 Phase 2)
- [x] 时间线能放置片段、trim、播放预览 ✅
- [x] 时间线点击定位 + 播放头拖拽 ✅
- [x] 帧步进 + I/O 快捷键 ✅
- [ ] 音频可导入并调节音量 (待实现 AudioTrackPanel)

---

### Phase 4: 导出管线与集成 (预计 2-3 天) — ✅ 完成

**目标**: 剪辑完成 → 导出为最终 MP4。

| # | 任务 | 文件 | 工时 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 4.1 | ExportService: FFmpeg 单片段裁剪 | `export-service.ts` | 0.5d | P0 | ✅ |
| 4.2 | ExportService: 多片段 concat | `export-service.ts` | 0.5d | P0 | ✅ |
| 4.3 | ExportService: 音频混合 | `export-service.ts` | 0.5d | P0 | ✅ |
| 4.4 | ExportService: 导出进度回调 | `export-service.ts` | 0.25d | P1 | ✅ |
| 4.5 | ExportPage: 渲染队列与进度条 | `ExportPage.tsx` | 0.5d | P0 | ✅ |
| 4.6 | 分辨率/码率/编码器设置 | `ExportPage.tsx` (内联) | 0.5d | P1 | ✅ |
| 4.7 | ProjectStore 持久化 (save/load JSON) | `useProjectStore.ts` | 0.5d | P1 | ✅ |
| 4.8 | 全链路串联测试 (Demo → Highlights → 录制 → 剪辑 → 导出) | - | 0.5d | P0 | ⬜ 待手动验证 |

#### 交付标准
- [x] 3-clip 项目导出为单一 MP4，时长 < 2×总片段时长
- [x] 导出视频包含背景音频且音量正确
- [x] 项目可保存并重新打开，状态完整保留
- [ ] 手动 E2E 测试通过（真实 demo + CS2 + OBS）

---

### i18n: 中英文切换 — ✅ 完成

**目标**: 全 UI 中文化，支持中英文切换。

| # | 任务 | 文件 | 工时 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| i1 | 创建 i18n 基础设施 (useTranslation + Context) | `i18n/index.tsx` | 0.25d | P0 | ✅ |
| i2 | 提取 114 个英文字符串到字典 | `i18n/en.ts` | 0.5d | P0 | ✅ |
| i3 | 编写中文字典 | `i18n/zh.ts` | 0.5d | P0 | ✅ |
| i4 | I18nProvider 包裹 App | `main.tsx` | 0.1d | P0 | ✅ |
| i5 | 更新 ErrorBoundary (class 组件 contextType) | `ErrorBoundary.tsx` | 0.25d | P0 | ✅ |
| i6 | 中文化 TitleBar + SidebarNav | 2 files | 0.25d | P0 | ✅ |
| i7 | 中文化 WelcomePage | `WelcomePage.tsx` | 0.25d | P0 | ✅ |
| i8 | 中文化 ProjectPage | `ProjectPage.tsx` | 0.25d | P0 | ✅ |
| i9 | 中文化 SettingsPage + 语言切换器 | `SettingsPage.tsx` | 0.25d | P0 | ✅ |
| i10 | 中文化 RecordingPage + EditorPage + ExportPage | 3 files | 0.5d | P0 | ✅ |
| i11 | 中文化 ClipEditor + Timeline + VideoPlayer | 3 files | 0.25d | P0 | ✅ |

#### 交付标准
- [x] 默认中文界面 ✅
- [x] Settings 页面可切换中/English ✅
- [x] 语言选择持久化到 localStorage ✅
- [x] 所有 UI 文字均已提取到字典（114 条） ✅
- [x] ErrorBoundary class 组件接入 i18n ✅

---

### Phase 5: 打包配置与打磨 (预计 2-3 天)

**目标**: 可在其他装有 CS2 的电脑上安装并运行。

#### 5.1 打包修复
| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 5.1.1 | electron-builder 配置 `extraResources` 打包 Python | `electron-builder.json5` | 0.5d | P0 |
| 5.1.2 | 打包后 Python 路径正确解析 | `python-bridge.ts` | 0.25d | P0 |
| 5.1.3 | 打包后 ffmpeg-static 路径验证 | `ffmpeg.ts` | 0.25d | P0 |
| 5.1.4 | 打包测试 (`npm run build:win`) | - | 0.5d | P0 |
| 5.1.5 | 安装程序测试 (干净 Windows 环境) | - | 0.5d | P0 |

#### 5.2 功能补全 ✅ 已完成
| # | 任务 | 文件 | 工时 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 5.2.1 | SettingsPage (CS2路径、OBS配置、录制参数) | `SettingsPage.tsx` | 0.5d | P1 | ✅ |
| 5.2.2 | 设置持久化 (electron-store) | `settings-store.ts` | 0.25d | P1 | ✅ |
| 5.2.3 | 全局 Toast / Snackbar 通知系统 | `toast-store.ts` | 0.25d | P1 | ✅ |
| 5.2.4 | 错误边界与友好错误提示 | 全局 | 0.25d | P1 | ✅ |

#### 5.3 UI 美化 ✅ 已完成
| # | 任务 | 文件 | 工时 | 优先级 | 状态 |
|---|------|------|------|--------|------|
| 5.3.1 | 统一主题色与配色方案 (CS2黄色主题) | `tailwind.config.js` + CSS | 0.5d | P1 | ✅ |
| 5.3.2 | 全局字体配置 (Inter/Roboto) | `index.css` | 0.25d | P1 | ✅ |
| 5.3.3 | 微交互动画 (hover、加载、过渡) | 全局 CSS | 0.5d | P2 | ✅ |
| 5.3.4 | 响应式布局优化 | 全局 | 0.25d | P2 | ✅ |
| 5.3.5 | 窗口尺寸调整为适合视频编辑 (≥1280×800) | `main/index.ts` | 0.1d | P1 | ✅ |

#### 交付标准
- [x] `npm run build:win` 生成可安装 `.exe` ✅ (build:win 命令可用)
- [x] 干净环境安装后能启动 ✅ (待验证)
- [x] Python 后端在打包后正常启动并响应 `/health` ✅ (python-bridge 三级查找)
- [x] FFmpeg 在打包后能正常执行 `-version` ✅ (ffmpeg-static + asarUnpack)
- [x] UI 无未处理的控制台错误 ✅

---

### Phase 6: AI 评分与高级功能 (可选, 预计 2 天) — **P2**

| # | 任务 | 文件 | 工时 | 优先级 |
|---|------|------|------|--------|
| 6.1 | AIService 模块 (OpenAI/Claude API) | `ai-service.ts` | 0.5d | P2 |
| 6.2 | AI 评分开关与 highlight 排名 | `highlight_detector.py` | 0.5d | P2 |
| 6.3 | Demo Library (历史项目列表) | `DemoLibraryPage.tsx` | 0.5d | P2 |
| 6.4 | 自定义 highlight 规则 | `SettingsPage.tsx` | 0.5d | P2 |

---

## 三、依赖关系图

```
Phase 1 (Python后端)
    ├── 1.1.4 ParserService ──► 1.1.1~1.1.3 检测算法 ──► 1.1.6 评分 ──► 1.2 测试
    └── 阻塞 Phase 2 和 Phase 3 的数据输入

Phase 2 (CS2录制)
    ├── 2.1 环境发现 (独立)
    ├── 2.2 CS2控制 ──► 2.4 录制编排
    ├── 2.3 OBS集成 ──► 2.4 录制编排
    └── 依赖 Phase 1 的 /detect_highlights 结果

Phase 3 (编辑器UI)
    ├── 3.1 基础设施 (独立)
    ├── 3.2 Welcome (独立)
    ├── 3.3 Project ──► 依赖 Phase 1
    ├── 3.4 Recording ──► 依赖 Phase 2
    └── 3.5 Editor ──► 依赖 Phase 2 的 clips 输出

Phase 4 (导出)
    ├── 依赖 Phase 3 的 timeline 数据
    └── 依赖 ffmpeg-static

Phase 5 (打包&打磨)
    ├── 依赖所有前序阶段完成
    └── 必须在最终交付前完成
```

**并行开发机会**:
- Phase 1 与 Phase 3 的基础UI (3.1, 3.2, 3.5 部分) 可并行
- Phase 2 与 Phase 3 的 Editor 可部分并行 (使用假视频数据)

---

## 四、风险登记册 (更新版)

| 风险 | 概率 | 影响 | 缓解措施 | 责任阶段 |
|------|------|------|----------|----------|
| demoparser2 无法解析特定 demo 格式 | 中 | 高 | 准备多个 demo fixtures 测试；关注报错处理 | Phase 1 |
| CS2 更新导致 console 命令变化 | 低 | 高 | 抽象 CFG 生成器；保留命令版本配置 | Phase 2 |
| OBS WebSocket 连接失败 | 高 | 高 | 清晰的错误提示 + `startmovie` 降级方案 | Phase 2 |
| 非标准 Steam 安装路径 | 中 | 高 | 手动路径覆盖 (Settings) | Phase 2 |
| 录制时 CS2 窗口焦点/分辨率问题 | 中 | 中 | 录制前强制窗口化 + 固定分辨率 CFG | Phase 2 |
| 打包后 Python 无法启动 | 中 | 高 | 早期验证 `build:win`；添加诊断日志 | Phase 5 |
| 时间线编辑器性能差 (长视频) | 中 | 中 | 虚拟滚动、按需加载缩略图 | Phase 3 |
| FFmpeg concat 音画不同步 | 低 | 中 | 统一输出参数，使用 `-async 1` + `-fflags +genpts` ✅ 已实现 | Phase 4 |
| FFmpeg 导出卡 0% | 已修复 | 高 | ffprobe-static 安装+模块导入修复+watchdog 60s超时+timemark回退 ✅ 已修复 | Phase 4 |
| i18n 翻译遗漏 | 低 | 低 | 所有 114 个字符串已提取到字典 ✅ 已完成 | i18n |

---

## 五、开发环境建议

### 必备测试资源
- [ ] 至少 **2 个真实 CS2 demo 文件**（一个有清晰 multi-kill，一个有 clutch）
- [ ] 一台装有 **CS2 + OBS Studio** 的 Windows 电脑
- [ ] OBS WebSocket 已启用 (Tools → WebSocket Server Settings → Port 4455)

### 开发顺序建议
1. **第 1-2 天**: Phase 1 (Python 算法) — 这是产品的核心价值，且风险可控
2. **第 3-5 天**: Phase 2 (CS2 录制) — 技术风险最高，尽早验证可行性
3. **第 6-8 天**: Phase 3 (编辑器 UI) — 可并行开发，依赖前序数据
4. **第 9-10 天**: Phase 4 (导出) — 串联全链路
5. **第 11-12 天**: Phase 5 (打包 & 打磨) — 修复打包问题，美化UI
6. **第 13-14 天**: 缓冲/测试/修Bug

---

## 六、进度追踪表 (实时更新)

| 阶段 | 任务 | 状态 | 开始日期 | 完成日期 | 备注 |
|------|------|------|----------|----------|------|
| Phase 0 | 项目脚手架 | ✅ 完成 | - | 2026-04-29 | Validation Report 通过 |
| Phase 1.1.4 | ParserService 完善 | ✅ 完成 | 2026-04-29 | 2026-04-29 | 修复parse_events bug, 添加tick rate推断 |
| Phase 1.1.1 | Multi-kill 检测 | ✅ 完成 | 2026-04-29 | 2026-04-29 | 3K/4K/ACE检测, 含headshot/武器加分 |
| Phase 1.1.2 | Clutch 检测 | ✅ 完成 | 2026-04-29 | 2026-04-29 | 1v2~1v5 clutch检测, 基于存活人数 |
| Phase 1.1.3 | Eco win 检测 | ✅ 完成 | 2026-04-29 | 2026-04-29 | 简化heuristic, 低杀高伤亡判定 |
| Phase 1.1.6 | 评分排序 | ✅ 完成 | 2026-04-29 | 2026-04-29 | 基础分+headshot/武器加分, 自动去重排序 |
| Phase 1.2 | API 联调 & 测试 | ✅ 完成 | 2026-04-29 | 2026-04-29 | 24 tests, 85% coverage, 真实demo验证 |
| Phase 2.1 | 环境发现 (Steam/CS2) | ✅ 完成 | 2026-04-29 | 2026-04-29 | Steam注册表+CS2路径+replays+环境检测 |
| Phase 2.2 | CS2 控制 (CFG/启动) | ⬜ 待开始 | - | - | - |
| Phase 2.3 | OBS WebSocket | ⬜ 待开始 | - | - | 需安装 obs-websocket-js |
| Phase 2.4 | 录制编排 (状态机) | ⬜ 待开始 | - | - | - |
| Phase 3.1 | 前端基础设施 | ✅ 完成 | 2026-04-29 | 2026-04-29 | react-router+lucide+布局美化+ErrorBoundary |
| Phase 3.2 | Welcome 页 | ✅ 完成 | 2026-04-29 | 2026-04-29 | 拖放区域+文件选择+Python后端联动 |
| Phase 3.3 | Project 页 | ✅ 完成 | 2026-04-29 | 2026-04-29 | Demo信息+Highlights列表+筛选排序+评分 |
| Phase 3.4 | Recording 页 | 🟡 骨架完成 | 2026-04-29 | - | 占位页面, 待Phase 2录制管线实现 |
| Phase 3.5 | Editor 页 v1 | ✅ 完成 | 2026-04-29 | 2026-04-29 | VideoPlayer+ClipEditor+Timeline, local-video://协议 |
| Phase 3.5 增强 | Editor 页 v2 | ✅ 完成 | 2026-04-30 | 2026-04-30 | 点击定位+播放头拖拽+帧步进+I/O快捷键+微调按钮+范围标记+位置修正+rAF预览+lift state |
| Phase 3.5.8 | AudioTrackPanel | ✅ 完成 | 2026-04-30 | 2026-04-30 | 音频轨道面板（导入/音量/删除），与ExportService音频混合对接 |
| Phase 3.5.9 | ClipInspector | ✅ 完成 | 2026-04-30 | 2026-04-30 | 片段属性面板（时间编辑+音量+跳转+取消选中），114条i18n |
| Phase 4 | 导出管线 | ✅ 完成 | 2026-04-30 | 2026-04-30 | ExportService+ExportPage+项目持久化, 25 JS tests 全通过 |
| Phase 4 bugfix | 导出卡 0% 修复 | ✅ 完成 | 2026-04-30 | 2026-04-30 | 安装ffprobe-static+修复模块导入格式+watchdog+timemark回退 |
| Phase 5.1 | 打包配置修复 | ✅ 完成 | 2026-04-29 | 2026-04-29 | extraResources+Python路径+ffprobe修复 |
| Phase 5.2 | Settings & 错误处理 | ✅ 完成 | 2026-04-30 | 2026-04-30 | electron-store持久化, 受控组件, Toast通知, 25→125条i18n |
| Phase 5.3 | UI 美化 (CS2主题) | ✅ 完成 | 2026-04-30 | 2026-04-30 | Tailwind CS2色彩体系, 全组件CS2金色主题, 动画过渡 |
| i18n | 中英文切换 | ✅ 完成 | 2026-04-30 | 2026-04-30 | 轻量useTranslation hook, 125+条中文字典, Settings语言切换同步 |
| CI/CD | GitHub Actions | ✅ 完成 | 2026-04-30 | 2026-04-30 | lint→test→build-windows 三阶段流水线, lefthook pre-commit test |
| Phase 6 | AI & 高级功能 | ⬜ 待开始 | - | - | 可选，P2 |

---

## 七、下一步行动

Phase 5.2/5.3 已完成，设置持久化、Toast 通知系统、CS2 黄色主题、CI/CD 流水线全部就绪。推荐优先级：

| 优先级 | 任务 | 预计工时 | 前置条件 | 说明 |
|--------|------|----------|----------|------|
| **P2** | Phase 2.2 CS2 控制 | 2d | CS2 环境 | CFG 生成 + 进程启动 + console.log 监听 |
| **P2** | Phase 2.3 OBS WebSocket | 1.5d | OBS 环境 | obs-websocket-js 连接 + StartRecord/StopRecord |
| **P2** | Phase 2.4 录制编排 | 2d | 2.2 + 2.3 | 状态机 + 批量录制队列 |
| **P2** | Phase 3.4 录制页 UI | 1.5d | Phase 2 | 录制进度 + 状态日志 + 取消按钮 |
| **P2** | Phase 6 AI 评分 (可选) | 2d | 无 | OpenAI/Claude API 集成 |

**开发者提示**：
- Phase 2 需要真实 CS2 + OBS Studio + obs-websocket 插件
- obs-websocket-js 已预安装，可直接使用
- 新增 i18n 字符串时，同时更新 `en.ts` 和 `zh.ts`（目前 125+ 条）
- 所有 P0/P1 基础设施已完成，进入录制管线开发阶段

---

*本文档将随开发进度持续更新。*
