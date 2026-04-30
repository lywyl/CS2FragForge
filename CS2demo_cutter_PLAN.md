# CS2 Demo Auto-Highlight Cutter — Master Plan

> **Project**: CS2 Demo Auto-Highlight Desktop Application  
> **Stack**: Electron 28+ + Vite + React 18 + TypeScript + Tailwind CSS + Zustand + FFmpeg + Python (demoparser2) + OBS WebSocket  
> **Date**: 2026-04-30  
> **Status**: Phase 5.2/5.3 Complete — Settings Persistence + Toast + CS2 Theme + CI/CD Ready  

---

## 1. Executive Summary

Build a desktop application that automatically identifies highlight moments from CS2 `.dem` files and produces edited video clips. The app uses a **Python backend** (`demoparser2`) for demo analysis and rule-based highlight detection, controls **CS2 client** for demo playback, records via **OBS WebSocket** API, and provides a **medium-complexity timeline editor** for clip trimming, arrangement, audio overlay, and export.

**Recording Strategy (Primary)**: OBS WebSocket v5 (`obs-websocket-js`)
**Recording Strategy (Fallback)**: ~~CS2 `startmovie`~~ (已废弃，不可靠)
**CS2 Control Method**: Auto-generated `.cfg` files + `console.log` polling
**Python ↔ Electron**: Local HTTP server (FastAPI) on `localhost:8765`  

---

## 2. Full Feature List (Prioritized)

### MVP — Phase 1 (Core Loop)
| Priority | Feature | Description |
|----------|---------|-------------|
| P0 | Demo file selection | Drag/drop or file picker for `.dem` files |
| P0 | CS2 installation auto-detect | Read Windows registry to find Steam/CS2 path |
| P0 | Python backend HTTP server | FastAPI server spawning, health checks, lifecycle management |
| P0 | Demo parsing API | Parse `.dem` → kills, rounds, player info, ticks |
| P0 | Rule-based highlight detection | Multi-kill (3K/4K/5K), clutch (1vX), ace, eco win detection |
| P0 | CS2 demo launcher | Copy `.dem` to CS2 replays folder, launch CS2 with demo |
| P0 | CFG command generation | Write `demo_gototick`, `spec_player`, `demo_timescale` to `.cfg` |
| P0 | OBS WebSocket integration | Connect to OBS, start/stop recording per highlight |
| P0 | Highlight recording loop | For each highlight: goto tick → start OBS recording → play → stop recording |
| P0 | Basic clip list UI | List recorded clips with start/end times, player, type |
| P0 | Simple trim editor | Per-clip start/end trim handles, preview player |
| P0 | FFmpeg export | Concatenate trimmed clips into single MP4 with audio |

### v1 — Phase 2 (Editor & Polish)
| Priority | Feature | Description |
|----------|---------|-------------|
| P1 | Timeline editor | `@keplar-404/react-timeline-editor` integration with clip tracks |
| P1 | Multi-clip arrangement | Drag to reorder clips on timeline |
| P1 | Audio track overlay | Import MP3/WAV as background music, volume control |
| P1 | CS2 `startmovie` fallback | Record via CS2 built-in when OBS unavailable |
| P1 | Progress UI for recording | Real-time status: "Navigating to tick...", "Recording...", "Saved to..." |
| P1 | Batch highlight detection | Parse multiple demos in queue |
| P1 | Player filter | Select which player(s) to record highlights for |
| P1 | Export settings | Resolution, bitrate, codec (H.264/HEVC), output format |

### Complete — Phase 3 (Advanced)
| Priority | Feature | Description |
|----------|---------|-------------|
| P2 | AI highlight scoring | Pluggable module calling OpenAI/Claude API to rank/rate highlights |
| P2 | Advanced detection | AWP flick rounds, Deagle one-taps, ninja defuse via demo heuristics |
| P2 | Custom highlight rules | User-defined thresholds (e.g., minimum 4K, ignore pistol rounds) |
| P2 | Video preview thumbnails | Extract frames at intervals for timeline visualization |
| P2 | Transitions | Basic fade/cut transitions between clips |
| P2 | Settings panel | CS2 path override, OBS connection config, hotkeys |
| P2 | Demo library | Browse previously parsed demos, cached highlight results |

---

## 3. Page / Component Structure

```
App (Electron BrowserWindow)
├── MainLayout
│   ├── TitleBar (custom frameless draggable region, window controls)
│   ├── SidebarNav
│   │   ├── NavItem: "Projects" (demo library)
│   │   ├── NavItem: "Editor" (timeline + preview)
│   │   ├── NavItem: "Settings"
│   │   └── NavItem: "Export" (render queue)
│   └── ContentArea
│
├── Pages
│   ├── WelcomePage (empty state, drop zone, recent projects)
│   ├── ProjectPage (demo details, player list, detected highlights)
│   ├── RecordingPage (CS2 + OBS control, progress, live status)
│   ├── EditorPage
│   │   ├── VideoPreview (HTML5 <video>, playback controls, current time)
│   │   ├── Toolbar (undo/redo, zoom, split, add audio, export button)
│   │   ├── TimelineContainer
│   │   │   ├── TimelineTracks (video clips + audio track)
│   │   │   ├── Playhead (scrubber synced to video)
│   │   │   └── ZoomControls
│   │   ├── ClipInspector (selected clip properties: start, end, speed)
│   │   └── AudioTrackPanel (imported audio files, volume, mute)
│   ├── SettingsPage
│   │   ├── CS2PathSetting (auto-detected + manual override)
│   │   ├── OBSConnectionSetting (host, port, password + test button)
│   │   ├── RecordingSettings (pre/post padding, tick rate default)
│   │   └── AISettings (API key, model selection, enable/disable)
│   └── ExportPage (render queue, progress bars, output folder)
│
├── Modals
│   ├── ImportDemoModal (file picker + player selection)
│   ├── OBSConnectionModal (connection test + status)
│   ├── ExportSettingsModal (codec, resolution, quality)
│   └── AiScoringModal (highlight ranking results)
│
└── Shared Components
    ├── Button, IconButton
    ├── DropZone
    ├── ProgressBar
    ├── Toast / Snackbar
    ├── VideoPlayer (wrapper around <video> with custom controls)
    ├── TimeDisplay (ms → MM:SS.ms formatter)
    └── EmptyState
```

---

## 4. Technical Architecture

### 4.1 High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Electron App                                   │
│  ┌────────────────────┐    ┌─────────────────────────────────────────┐  │
│  │   Main Process     │    │         Renderer Process                │  │
│  │                    │    │                                         │  │
│  │  ┌──────────────┐  │◄──►│  ┌─────────────────────────────────┐   │  │
│  │  │ Python Bridge│  │ IPC│  │  React + Zustand                │   │  │
│  │  │ (FastAPI Mgmt│  │    │  │  ├─ Pages (Welcome/Editor/...)  │   │  │
│  │  │  start/stop) │  │    │  │  ├─ Stores (project, clips, UI) │   │  │
│  │  └──────────────┘  │    │  │  └─ Components (Timeline, ...)  │   │  │
│  │         │          │    │  └─────────────────────────────────┘   │  │
│  │  ┌──────────────┐  │    │                                         │  │
│  │  │ CS2 Launcher │  │    │  <video> (file:// preview clips)        │  │
│  │  │ (spawn cs2,  │  │    │                                         │  │
│  │  │  write .cfg) │  │    │                                         │  │
│  │  └──────────────┘  │    │                                         │  │
│  │         │          │    │                                         │  │
│  │  ┌──────────────┐  │    │                                         │  │
│  │  │ OBS WS Client│  │    │                                         │  │
│  │  │ (obs-websocket│  │    │                                         │  │
│  │  │  -js)        │  │    │                                         │  │
│  │  └──────────────┘  │    │                                         │  │
│  │         │          │    │                                         │  │
│  │  ┌──────────────┐  │    │                                         │  │
│  │  │ FFmpeg Svc   │  │    │                                         │  │
│  │  │ (fluent-ffmpeg│  │    │                                         │  │
│  │  │  trim/concat)│  │    │                                         │  │
│  │  └──────────────┘  │    │                                         │  │
│  └────────────────────┘    └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
         │                           │                          │
         │ HTTP localhost:8765       │ spawn                    │ WebSocket
         ▼                           ▼                          ▼
┌────────────────────┐    ┌──────────────────┐      ┌─────────────────────┐
│  Python Backend    │    │   CS2 Client     │      │    OBS Studio       │
│  (FastAPI +        │    │   (cs2.exe)      │      │    (WebSocket v5)   │
│   demoparser2)     │    │                  │      │                     │
│  ┌──────────────┐  │    │  Reads .cfg for  │      │  Start/Stop Record  │
│  │ /parse_demo  │  │    │  demo_gototick   │      │  Query Status       │
│  │ /detect_hl   │  │    │  spec_player     │      │                     │
│  │ /health      │  │    │                  │      │                     │
│  └──────────────┘  │    │  Outputs:        │      │  Outputs:           │
│                    │    │  -console log    │      │  - Recorded MP4s    │
└────────────────────┘    └──────────────────┘      └─────────────────────┘
```

### 4.2 CS2 Recording Pipeline (Detailed)

This is the most complex and risky subsystem. It is broken into 6 stages:

#### Stage A: Environment Discovery
1. **Find Steam installation**: Read Windows registry key `HKEY_CURRENT_USER\Software\Valve\Steam` → `SteamPath`
2. **Find CS2 executable**: `<steam_path>/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/cs2.exe`
3. **Find CS2 replays folder**: `<steam_path>/steamapps/common/Counter-Strike Global Offensive/game/csgo/replays/`
4. **Validate paths**: Check files exist, warn user if CS2 not found

#### Stage B: Demo Preparation
1. Copy user-selected `.dem` file to CS2 `replays/` folder (or create a symlink)
2. Generate a unique session ID to avoid filename collisions
3. Verify demo is readable by doing a quick Python parse (header only)

#### Stage C: CFG Command Generation & CS2 Launch
1. For each highlight, generate a `.cfg` file (e.g., `hl_001.cfg`):
   ```cfg
   // Generated by CS2demo_cutter
   demo_gototick 15234
   spec_player steamid:76561198000000001
   demo_timescale 1.0
   ```
2. Launch CS2 with arguments:
   ```
   cs2.exe -novid -console -condebug +playdemo mydemo +exec hl_001
   ```
3. The `-condebug` flag writes all console output to `<cs2_dir>/game/csgo/console.log`
4. Monitor `console.log` for keywords (`Demo playback started`, `Reached tick`) to confirm navigation

#### Stage D: OBS WebSocket Recording Control (v5)
1. **Connect**: Use `obs-websocket-js` (v5) to connect to `ws://host:port` with password
2. **Auto-Configure**: Create "CS2FragForge" scene + Game Capture source for CS2 window via OBS WebSocket API
3. **Pre-roll**: Wait for CS2 to settle at target tick (parse console.log or wait fixed delay)
4. **Start recording**: Call `StartRecord` via OBS WebSocket — CS2 launches once, OBS records continuously
5. **Playback**: Navigate through all highlights sequentially using combined autoexec.cfg with `wait` commands
6. **Stop recording**: Call `StopRecord` via OBS WebSocket
7. **Retrieve file**: Get output path from `GetRecordStatus`; use FFmpeg to split into individual clips based on timestamps

#### Stage E: ~~Fallback Recording (CS2 `startmovie`)~~ — 已废弃
CS2 `startmovie` 不可靠（CS2 不执行 CFG 脚本），已完全切换到 OBS WebSocket 方案。

#### Stage F: Async Orchestration & Progress
The recording loop runs as an async state machine in the Electron main process:

```typescript
interface RecordingState {
  status: 'idle' | 'connecting' | 'navigating' | 'preroll' | 'recording' | 'finalizing' | 'error';
  currentHighlightIndex: number;
  totalHighlights: number;
  currentTick: number;
  obsStatus: 'disconnected' | 'connected' | 'recording';
  cs2Pid: number | null;
  outputPath: string | null;
  errorMessage: string | null;
}
```

Events are pushed to the renderer via IPC (`recording:state-update`) every 500ms or on state change.

### 4.3 Python Backend (FastAPI)

**File**: `src/python/main.py` (uvicorn server)

```python
from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
from demoparser2 import DemoParser
import pandas as pd

app = FastAPI()

class ParseDemoRequest(BaseModel):
    demo_path: str

class HighlightResult(BaseModel):
    type: str          # "3K", "4K", "ACE", "CLUTCH", "ECO_WIN"
    player_name: str
    player_steamid: int
    round: int
    tick_start: int
    tick_end: int
    kill_count: int
    weapons: list[str]
    score: float       # confidence / coolness score

@app.post("/parse_demo")
def parse_demo(req: ParseDemoRequest) -> dict:
    parser = DemoParser(req.demo_path)
    header = parser.parse_header()
    events = parser.parse_events(
        ["player_death", "round_end", "bomb_planted", "bomb_defused"],
        player=["X", "Y", "Z", "active_weapon_name", "is_headshot"],
        other=["total_rounds_played"]
    )
    return {"header": header, "events": {name: df.to_dict() for name, df in events}}

@app.post("/detect_highlights")
def detect_highlights(req: ParseDemoRequest) -> list[HighlightResult]:
    # Rule-based detection engine
    ...

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
```

**Lifecycle**: Electron main process starts the uvicorn server on a random available port (falling back to 8765), probes `/health` every 2s, and kills the process on app quit.

### 4.4 Data Models (Zustand Stores)

```typescript
// types/project.ts
interface Project {
  id: string;
  demoPath: string;
  cs2InstallPath: string;
  name: string;
  createdAt: number;
  highlights: Highlight[];
  clips: Clip[];         // after recording
  status: 'parsed' | 'recording' | 'recorded' | 'edited' | 'exported';
}

interface Highlight {
  id: string;
  type: '3K' | '4K' | 'ACE' | 'CLUTCH' | 'ECO_WIN' | 'CUSTOM';
  playerName: string;
  playerSteamId: string;
  round: number;
  tickStart: number;
  tickEnd: number;
  videoStartSec: number;   // mapped after recording
  videoEndSec: number;
  score: number;
}

interface Clip {
  id: string;
  sourcePath: string;      // path to recorded MP4
  startSec: number;        // trim start
  endSec: number;          // trim end
  timelineStart: number;   // position on timeline
  timelineEnd: number;
  volume: number;
}

interface AudioTrack {
  id: string;
  sourcePath: string;
  volume: number;
  startSec: number;
  endSec: number;
}
```

### 4.5 FFmpeg Operations

Bundled via `ffmpeg-static` with `asarUnpack`. Key commands:

```typescript
// Trim a single clip
ffmpeg(inputPath)
  .setStartTime(startSec)
  .setDuration(endSec - startSec)
  .outputOptions(['-c:v', 'libx264', '-crf', '22', '-c:a', 'aac'])
  .output(outputPath)
  .run();

// Concatenate multiple clips
const concatFile = clips.map(c => `file '${c.path}'`).join('\n');
ffmpeg()
  .input(concatTxtPath)
  .inputOptions(['-f', 'concat', '-safe', '0'])
  .outputOptions(['-c', 'copy'])
  .output(finalPath)
  .run();

// Add background audio
ffmpeg(videoPath)
  .input(audioPath)
  .complexFilter([
    `[1:a]volume=${audioVolume}[a1]`,
    `[0:a][a1]amix=inputs=2:duration=first[aout]`
  ])
  .outputOptions(['-map', '0:v', '-map', '[aout]', '-c:v', 'copy'])
  .output(outputPath)
  .run();
```

---

## 5. Development Phases & Parallel Execution

### Phase 0: Project Scaffolding (2 days)
**Goal**: Buildable, testable Electron app shell with Python backend stub.

| Task | Owner | Parallel? |
|------|-------|-----------|
| Initialize Electron + Vite + React + TypeScript | Dev | No |
| Configure Tailwind CSS, Zustand, Vitest | Dev | Yes (with above) |
| Set up Python venv + FastAPI + demoparser2 + pytest | Dev | Yes (with above) |
| Configure `electron-builder` with `ffmpeg-static` + `asarUnpack` | Dev | Yes (with above) |
| Add Prettier, ESLint, conventional commits hook | Dev | Yes (with above) |
| Create folder structure (`src/main`, `src/renderer`, `src/python`, `tests/`) | Dev | Yes (with above) |
| Write initial `README.md` with setup instructions | Dev | No (last) |

**Validation**: `npm run dev` opens Electron window. `npm run test` runs Vitest. `python -m pytest` runs Python tests. `npm run build` produces `.exe`.

---

### Phase 1: Python Backend — Demo Parser & Highlight Detection (3 days)
**Goal**: Fully functional Python API that accepts a `.dem` path and returns ranked highlights.

| Task | Owner | Parallel? |
|------|-------|-----------|
| Implement `DemoParserService` wrapper around `demoparser2` | Dev | No |
| Implement `/parse_demo` endpoint with full event extraction | Dev | Yes (with above) |
| Build rule-based `HighlightDetector` | Dev | No |
| Detect multi-kills (3K, 4K, 5K/ACE) per round | Dev | Yes (with above) |
| Detect clutch wins (1v2, 1v3, 1v4, 1v5) | Dev | Yes (with above) |
| Detect eco wins & bomb plants/defuses | Dev | Yes (with above) |
| Implement tick-to-seconds converter | Dev | No |
| Write comprehensive pytest suite with sample demo fixtures | Dev | Yes (with above) |
| Add `/health` endpoint and server startup script | Dev | No |

**Parallel Groups**: Tasks marked "Yes" can be worked in parallel once `DemoParserService` interface is defined.

**Validation**: POST `/parse_demo` with a real `.dem` returns valid JSON. POST `/detect_highlights` returns at least 1 highlight for a known highlight demo. All pytest tests pass.

---

### Phase 2: CS2 Recording Pipeline (4 days)
**Goal**: Automatic recording of highlight clips from demo ticks using CS2 + OBS.

| Task | Owner | Parallel? |
|------|-------|-----------|
| Implement `SteamRegistryService` (read Windows registry) | Dev | No |
| Implement `CS2PathResolver` (validate CS2 + replays folder) | Dev | Yes (with above) |
| Implement `DemoLauncher` (copy .dem, build launch args) | Dev | Yes (with above) |
| Implement `CfgWriter` (generate .cfg files per highlight) | Dev | Yes (with above) |
| Implement `ConsoleLogWatcher` (tail -f console.log) | Dev | Yes (with above) |
| Implement `OBSService` (obs-websocket-js connect/auto-configure/start/stop) | Dev | No |
| Implement `RecordingOrchestrator` (async state machine, single session) | Dev | No |
| Add progress IPC channel (`recording:state-update`) | Dev | Yes (with above) |
| Build RecordingPage UI (progress bars, status log, cancel button) | Dev | Yes (with above) |
| ~~Implement `startmovie` fallback path~~ | - | 已废弃 |
| Write integration tests with mocked CS2/OBS | Dev | Yes (with above) |

**Validation**: 
- App auto-detects CS2 path on first run.
- Clicking "Record Highlights" launches CS2, navigates to ticks, and produces `.mp4` files in the clips folder.
- Recording progress is visible in real-time.
- Cancel button terminates CS2 and OBS recording gracefully.

---

### Phase 3: Video Editor UI (4 days)
**Goal**: Functional timeline editor for clip trimming, arrangement, and preview.

| Task | Owner | Parallel? |
|------|-------|-----------|
| Implement `VideoPlayer` component (custom controls, frame stepping) | Dev | No |
| Implement `ClipList` component (sortable, deletable clips) | Dev | Yes (with above) |
| Integrate `@keplar-404/react-timeline-editor` base | Dev | No |
| Build custom `Timeline` wrapper with clip tracks + playhead | Dev | Yes (with above) |
| Implement trim handles on timeline clips | Dev | Yes (with above) |
| Implement drag-to-reorder on timeline | Dev | Yes (with above) |
| Implement `AudioTrackPanel` (import, volume, waveform stub) | Dev | Yes (with above) |
| Sync video preview with timeline playhead | Dev | No |
| Implement `ExportPage` with render queue UI | Dev | Yes (with above) |
| Write Vitest tests for timeline state logic | Dev | Yes (with above) |

**Validation**: 
- User can drag clips onto timeline, reorder, and trim start/end.
- Video preview updates when scrubbing timeline.
- Audio file can be imported and its volume adjusted.

---

### Phase 4: Export Pipeline & Integration (2 days)
**Goal**: End-to-end: detected highlights → recorded clips → edited timeline → exported MP4.

| Task | Owner | Parallel? |
|------|-------|-----------|
| Implement `ExportService` (FFmpeg trim + concat + audio mix) | Dev | No |
| Wire ExportPage to `ExportService` IPC calls | Dev | Yes (with above) |
| Add export progress reporting via IPC | Dev | Yes (with above) |
| Implement `ProjectStore` persistence (save/load JSON) | Dev | Yes (with above) |
| Integrate all pages into full user flow | Dev | No |
| End-to-end manual test with real demo + CS2 + OBS | Dev | No |

**Validation**: 
- Full workflow: Import demo → detect highlights → record clips → trim in editor → export MP4.
- Exported video plays correctly with audio.
- Project can be saved and reopened.

---

### Phase 5: Polish & AI Integration (2 days)
**Goal**: Settings panel, AI scoring, advanced detection, demo library.

| Task | Owner | Parallel? |
|------|-------|-----------|
| Build SettingsPage with all config options | Dev | No |
| Implement `AIService` module (OpenAI/Claude API client) | Dev | Yes (with above) |
| Add AI scoring toggle in highlight detection | Dev | Yes (with above) |
| Implement Demo Library (list past projects, cached results) | Dev | Yes (with above) |
| Add keyboard shortcuts (space=play, del=delete clip) | Dev | Yes (with above) |
| Add error handling & user-friendly error messages | Dev | Yes (with above) |
| Final UI polish, dark mode consistency, responsive layout | Dev | No |

**Validation**: 
- AI scoring returns results within 5s per highlight batch.
- Settings persist across app restarts.
- All error states show helpful messages.

---

## 6. Per-Task Category & Skills Mapping

Use these mappings when delegating to sub-agents or planning sprints:

| Module | Tasks | Category | Skills |
|--------|-------|----------|--------|
| Project scaffolding | Vite config, Electron main process setup, build pipeline | `quick` | [] |
| Python backend | demoparser2 integration, FastAPI endpoints, highlight algorithms | `deep` | [] |
| CS2 automation | Registry reading, process spawning, CFG generation, log tailing | `deep` | [] |
| OBS integration | WebSocket client, state machine, async orchestration | `deep` | [] |
| Video editor UI | Timeline component, drag-and-drop, preview sync | `visual-engineering` | [] |
| FFmpeg integration | fluent-ffmpeg commands, progress parsing, error handling | `deep` | [] |
| Settings & polish | Forms, validation, persistence, error handling | `quick` | [] |
| AI scoring | OpenAI API client, prompt engineering, result parsing | `quick` | [] |
| Testing | Vitest (renderer), pytest (Python), integration tests | `deep` | [] |

**Parallel Execution Opportunities**:
- **Phase 1 + Phase 3 UI prototyping**: Once the `/detect_highlights` API contract is defined, the frontend team can mock the API and build the UI in parallel with the Python backend implementation.
- **Phase 2 CS2 pipeline + Phase 3 editor**: The editor can be built with dummy MP4 files while the CS2 recording pipeline is being developed.
- **Phase 5 AI module**: Can be developed independently once the `Highlight` data model is stable.

---

## 7. Atomic Commit Strategy

We use **Conventional Commits** with atomic, small commits. Each commit represents a single logical change and should not break the build.

### Commit Types
| Type | Use For |
|------|---------|
| `feat:` | New feature or capability |
| `fix:` | Bug fix |
| `test:` | Adding or updating tests |
| `refactor:` | Code restructuring without behavior change |
| `docs:` | Documentation updates |
| `chore:` | Build, dependency, or config changes |

### Commit Rules
1. **One concern per commit**: A commit should only change the parser OR the UI, not both.
2. **Tests with code**: When adding a feature, the test commit should ideally be in the same PR (squash if needed), but individual commits can separate `test:` and `feat:`.
3. **Green builds**: Every commit on `main` must pass CI (lint + tests).
4. **Branch naming**: `feat/highlight-detection`, `fix/cs2-path-windows`, `test/export-service`
5. **PR size**: Max 400 lines changed per PR for reviewability.

### Example Commit Sequence (Phase 1)
```
chore: add Python venv and install demoparser2 + fastapi
feat: implement DemoParserService wrapper with parse_header
feat: add /parse_demo FastAPI endpoint
feat: implement multi-kill detection algorithm
test: add pytest fixtures and multi-kill detection tests
feat: implement clutch detection algorithm
test: add clutch detection tests
feat: add /detect_highlights endpoint combining all detectors
feat: integrate Python server startup into Electron main process
```

---

## 8. TDD-Oriented Test Plan

### Philosophy
- **Write the test first** (or immediately alongside implementation).
- **Red-Green-Refactor**: See the test fail, make it pass, then clean up.
- **Test at the right level**: Unit tests for algorithms, integration tests for IPC/API boundaries, E2E tests for critical user flows.

### Python Backend Tests (`tests/python/`)
```
test_parser_service.py
  ├── test_parse_header_returns_map_name
  ├── test_parse_events_returns_player_death_df
  └── test_parse_events_single_pass_efficiency

test_highlight_detector.py
  ├── test_detect_multi_kill_3k
  ├── test_detect_multi_kill_4k
  ├── test_detect_ace_5k
  ├── test_detect_clutch_1v2
  ├── test_detect_clutch_1v3
  ├── test_detect_eco_win
  ├── test_no_false_positives_on_boring_round
  └── test_highlight_scoring_ranks_ace_above_3k

test_tick_converter.py
  ├── test_tick_to_seconds_64tick
  └── test_tick_to_seconds_128tick
```

### Renderer Tests (`tests/renderer/` — Vitest + Testing Library)
```
VideoPlayer.test.tsx
  ├── renders video element with correct src
  └── calls onTimeUpdate when video progresses

Timeline.test.tsx
  ├── renders clips at correct positions
  ├── updates clip position on drag
  └── enforces minimum clip duration

ClipList.test.tsx
  ├── renders highlights from store
  └── clicking clip seeks timeline to start

ExportPage.test.tsx
  ├── shows progress bar during export
  └── displays success toast on completion
```

### Main Process Tests (`tests/main/` — Vitest with Node environment)
```
CS2PathResolver.test.ts
  ├── resolves path from mock registry
  └── throws when cs2.exe not found

CfgWriter.test.ts
  ├── generates correct demo_gototick command
  └── escapes player names with special chars

OBSService.test.ts
  ├── connects to mock WebSocket server
  └── startRecord throws when not connected
```

### Integration Tests
1. **Python server lifecycle**: Start server → call `/health` → stop server → verify process exited.
2. **Recording orchestrator (mocked)**: Simulate CS2 launch → verify CFG written → simulate OBS record → verify state transitions.
3. **End-to-end (manual)**: Full workflow with a real `.dem` file, CS2, and OBS.

---

## 9. Validation Criteria Per Phase

### Phase 0 — Scaffolding
- [ ] `npm run dev` launches Electron with React dev server.
- [ ] `npm run test` runs Vitest with 0 failing tests (even if 0 tests).
- [ ] `python -m pytest` runs with 0 failures.
- [ ] `npm run build:win` produces `CS2demo_cutter Setup.exe` without errors.
- [ ] `ffmpeg -version` runs from bundled binary in packaged app.

### Phase 1 — Python Backend
- [ ] `/health` returns `{"status": "ok"}` within 1s of server start.
- [ ] `/parse_demo` with a real 64-tick MM demo returns header + events in <3s.
- [ ] `/detect_highlights` returns correct multi-kill count for a known highlight demo.
- [ ] `/detect_highlights` correctly identifies a 1v2 clutch in test data.
- [ ] All pytest tests pass (coverage ≥ 80%).

### Phase 2 — CS2 Recording Pipeline (OBS WebSocket)
- [ ] App auto-detects CS2 path within 2s on a standard Steam install.
- [ ] Clicking "Record" connects to OBS WebSocket and auto-configures scene.
- [ ] Generated combined `.cfg` file contains correct `demo_gototick` + `wait` sequences for all highlights.
- [ ] OBS WebSocket connects, creates scene, and starts/stops recording successfully.
- [ ] CS2 launches once, plays through all highlights, then exits.
- [ ] After recording, FFmpeg splits OBS output into individual `.mp4` clips in the project's clips folder.
- [ ] Recording progress UI updates at least every 1s.
- [ ] Cancel button stops OBS recording and kills CS2 without corrupting files.

### Phase 3 — Video Editor
- [ ] User can import a recorded clip and see it on the timeline.
- [ ] Trimming a clip updates the video preview in real-time.
- [ ] Dragging clips reorders them on the timeline.
- [ ] Audio file can be imported and volume adjusted (0-100%).
- [ ] Playhead scrubs video smoothly (<100ms latency).

### Phase 4 — Export & Integration
- [ ] Exporting a 3-clip project produces a single MP4 <2x the total clip duration.
- [ ] Exported video includes background audio at correct volume.
- [ ] Project JSON can be saved and reopened with all clips/timeline state intact.
- [ ] Full manual E2E test passes with a real competitive MM demo.

### Phase 5 — Polish & AI
- [ ] Settings persist after app restart.
- [ ] AI scoring toggle works and returns results in <5s (with valid API key).
- [ ] Demo library shows all past projects with correct metadata.
- [ ] No unhandled errors in main or renderer console during normal use.

---

## 10. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| CS2 registry path detection fails on non-standard installs | High | Allow manual path override in Settings |
| OBS WebSocket not enabled or wrong password | High | Clear setup instructions + connection test modal + auto-configure scene |
| CS2 console command behavior changes in updates | Medium | Monitor CS2 patch notes; abstract command generation |
| demoparser2 breaks with new CS2 demo format | Medium | Pin version; have fallback parser (awpy) |
| Recording is too slow (launch CS2 per highlight) | Medium | Batch recordings in single CS2 session; cache recorded clips |
| Electron + FFmpeg bundle size too large | Low | Use `electron-builder` compression; lazy-load Python deps |
| ~~`startmovie` TGA frame generation is huge/slow~~ | N/A | 已废弃 startmovie，完全使用 OBS WebSocket |
| Windows-only (registry dependency) | Low | MVP is Windows-only; abstract path resolver for future macOS/Linux |

---

## 11. Recommended Next Actions

1. **Create `task_plan.md`** using the Manus planning plugin to track daily progress.
2. **Begin Phase 0**: Initialize the repository with the exact stack specified above.
3. **Parallel kickoff**: Once the API contract for `/detect_highlights` is drafted, start Phase 3 UI prototyping with mocked data.
4. **Find test demo**: Obtain 2-3 real CS2 `.dem` files (one with clear multi-kills, one with a clutch) for development and CI.

---

*This plan is ready for execution. Do not modify without team consensus.*
