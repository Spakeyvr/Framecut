# FrameCut

FrameCut is a desktop video editor built with React + TypeScript (frontend) and Tauri + Rust (backend).

## Current status

This project is an MVP with core editing flow implemented and some areas still stubbed. **This is a beta, do not expect something easy-to-use with low amounts of bugs.**

Implemented:
- Import video, audio, and image media via file dialog
- Add clips to timeline (drag/drop or double-click)
- Basic timeline editing (move, trim, split, delete)
- Playback preview with playhead controls
- Undo/redo
- Export timeline with progress and cancel support
- Full project saving
- Help section

Not fully implemented yet:
- Proxies and waveform generation (backend stubs)
- Effects/captions pipelines (backend stubs)

## Tech stack

- React 19 + TypeScript + Vite
- Zustand (state management)
- Tauri 2 + Rust workspace crates
- FFmpeg/FFprobe for media processing

## Installation

1. Download the latest release from the [Releases](../../releases) page.
2. Install FFmpeg (both `ffmpeg` and `ffprobe` must be on your `PATH`): https://ffmpeg.org/download.html
3. Run FrameCut. On startup it checks for FFmpeg/FFprobe and shows an in-app warning if missing.

## Building from source

Prerequisites:
- Node.js 18+
- Rust (stable toolchain)
- Tauri platform prerequisites: https://v2.tauri.app/start/prerequisites/
- FFmpeg on `PATH` (see above)

```bash
npm install
npm run tauri:build
```

For development:

```bash
npm run tauri:dev
```

## Keyboard shortcuts

- `Space` - Play/Pause
- `Delete` / `Backspace` - Delete selected clip
- `S` - Split selected clip at playhead
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo
- `Arrow Left/Right` - Move playhead by frame (~1/30s)
- `Shift + Arrow Left/Right` - Move playhead by 1 second
- `Home` - Go to timeline start
- `End` - Go to timeline end

## Project structure

- `src/` - React UI (toolbar, media pool, preview, inspector, timeline, export)
- `src-tauri/src/` - Tauri commands and app wiring
- `src-tauri/crates/fc-media` - FFmpeg probing/thumbnails
- `src-tauri/crates/fc-preview` - Frame decode for timeline preview
- `src-tauri/crates/fc-export` - FFmpeg export pipeline
