# CS2 Demo Auto-Highlight Cutter

Desktop application that automatically identifies highlight moments from CS2 `.dem` files and produces edited video clips.

## Features

- **Demo Parsing**: Parse CS2 `.dem` files using demoparser2 ✅
- **Highlight Detection**: Rule-based detection for multi-kills (3K/4K/5K/ACE), clutch wins (1v2~1v5), eco wins ✅
- **Video Editor**: Timeline with trim (In/Out points), frame-step navigation, drag-to-reorder ✅
- **Audio Mixing**: Import audio tracks, adjust volume, mix with video ✅
- **Video Export**: FFmpeg pipeline (trim → concat → audio mix) with progress and cancel ✅
- **i18n**: Chinese/English switching with 114 UI strings ✅
- **CS2 Integration**: Auto-detect CS2 installation via Steam registry ✅ (recording: Phase 2 - pending)
- **Recording**: OBS WebSocket integration for automated recording (Phase 2 - pending)
- **AI Scoring**: Optional OpenAI/Claude integration for highlight ranking (Phase 6 - optional)

## Tech Stack

- **Frontend**: Electron 33 + Vite + React 18 + TypeScript + Tailwind CSS
- **State Management**: Zustand
- **Backend**: Python 3.11 + FastAPI + demoparser2
- **Video Processing**: FFmpeg via fluent-ffmpeg + ffmpeg-static + ffprobe-static
- **Recording**: OBS WebSocket v5 (Phase 2 - pending)
- **Testing**: Vitest (25 JS tests) + pytest (24 Python tests, 85% coverage)

## Prerequisites

- **Node.js**: v20 or higher
- **Python**: 3.11 or higher (auto-detected from `.venv` or system PATH)
- **Git**: 2.31.0 or higher
- **Windows**: 10/11 (primary platform)

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/CS2demo_cutter.git
cd CS2demo_cutter
```

### 2. Install dependencies

```bash
npm install
```

FFmpeg and FFprobe are bundled via `ffmpeg-static`/`ffprobe-static`. Python backend starts automatically on app launch.

### 3. Verify installation

```bash
# Start the app
npm run dev

# Run tests
npm run test              # JS/TS tests
python -m pytest          # Python tests
```

## Development

### Start development server

```bash
npm run dev
```

This launches the Electron app with hot-reload for the renderer process.

### Run tests

```bash
# Run all Vitest tests (renderer + main)
npm run test

# Run Python tests
python -m pytest

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Linting and formatting

```bash
# Run ESLint
npm run lint

# Run Prettier
npm run format

# Check formatting
npm run format:check
```

## Building

### Build for Windows

```bash
npm run build:win
```

This produces `dist/CS2demo_cutter Setup.exe`.

### Build for other platforms

```bash
npm run build:mac
npm run build:linux
```

## Project Structure

```
CS2demo_cutter/
├── src/
│   ├── main/                    # Electron main process
│   │   ├── index.ts             # Main window, IPC handlers, local-video:// protocol
│   │   ├── python-bridge.ts     # Python server management (3-level fallback)
│   │   ├── ffmpeg.ts            # FFmpeg/FFprobe path resolution
│   │   ├── export-service.ts    # FFmpeg export pipeline (trim/concat/audio mix)
│   │   └── cs2-path-resolver.ts # Steam registry + CS2 path discovery
│   ├── preload/                 # Preload scripts (IPC bridge)
│   │   └── index.ts             # Exposes electronAPI to renderer
│   ├── renderer/                # React frontend
│   │   └── src/
│   │       ├── App.tsx          # Router container
│   │       ├── components/      # UI components
│   │       │   ├── VideoPlayer.tsx     # HTML5 video + custom controls + frame step
│   │       │   ├── ClipEditor.tsx      # Trim panel (In/Out + frame nudge)
│   │       │   ├── Timeline.tsx        # Timeline visualization + drag
│   │       │   └── AudioTrackPanel.tsx # Audio import + volume control
│   │       ├── pages/           # Route pages (Welcome, Project, Editor, Export, Settings)
│   │       ├── stores/          # Zustand state management
│   │       ├── i18n/            # Internationalization (en/zh, 120 strings)
│   │       └── types/           # TypeScript type definitions
│   ├── python/                  # Python backend
│   │   ├── main.py              # FastAPI application
│   │   ├── models.py            # Pydantic models
│   │   └── services/            # ParserService, HighlightDetector
│   └── shared/                  # Shared types (IPC channels, export types)
├── tests/
├── resources/                   # App resources (icons)
├── CURRENT_STATUS.md            # Current development status (START HERE)
├── DEVELOPMENT_PLAN.md          # Full development plan and progress tracking
├── package.json
├── vitest.config.ts
└── electron-builder.json5
```

## Configuration

### CS2 Installation Path

The app auto-detects CS2 installation via Windows Registry. If detection fails:

1. Go to Settings
2. Set CS2 Installation Path manually
3. Point to: `<Steam>/steamapps/common/Counter-Strike Global Offensive/`

### OBS WebSocket

For recording functionality:

1. Install OBS Studio
2. Enable WebSocket server: Tools → WebSocket Server Settings
3. Set port: 4455 (default)
4. Set password (optional but recommended)
5. Configure in app: Settings → OBS Connection

## API Endpoints (Python Backend)

The Python backend runs on `http://localhost:8765`:

- `GET /health` - Health check
- `POST /parse_demo` - Parse a .dem file
- `POST /detect_highlights` - Detect highlights in a demo
- `POST /game_info` - Get game info (map, tick rate, players)

## Troubleshooting

### Python not found

Ensure Python 3.11+ is installed and in PATH:

```bash
python --version
```

### npm install fails

Clear npm cache and retry:

```bash
npm cache clean --force
rm -rf node_modules
npm install
```

### Electron app won't start

Check if port 5173 is available:

```bash
netstat -ano | findstr :5173
```

### FFmpeg/FFprobe not working

FFmpeg and FFprobe are bundled with the app. If issues occur:

1. Check `src/main/ffmpeg.ts` path resolution
2. Verify both packages are installed: `npm list ffmpeg-static ffprobe-static`
3. Note: `ffprobe-static` exports `{ path: string }` (object), not a string directly

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "feat: add your feature"`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a pull request

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Code refactoring
- `chore:` - Build/tooling changes

## License

[Your License Here]

## Acknowledgments

- [electron-vite](https://electron-vite.org/) - Electron + Vite integration
- [demoparser2](https://github.com/LaihoE/demoparser2) - CS2 demo parser
- [obs-websocket-js](https://github.com/obs-websocket-community/obs-websocket-js) - OBS WebSocket client
