# FrameCut

FrameCut is a desktop video editor built with React + TypeScript (frontend) and Tauri + Rust (backend).

## Current status

This project is an MVP with core editing flow implemented and some areas still stubbed.

Implemented:
- Import video, audio, and image media via file dialog
- Generate media metadata and thumbnails with FFmpeg/FFprobe
- Add clips to timeline (drag/drop or double-click)
- Basic timeline editing (move, trim, split, delete)
- Playback preview with playhead controls
- Undo/redo (frontend state snapshots)
- Export timeline to MP4 with progress and cancel support

Not fully implemented yet:
- Proxies and waveform generation (backend stubs)
- Effects/captions pipelines (backend stubs)
- Full project save/load flow wired into UI shortcuts

## Tech stack

- React 19 + TypeScript + Vite
- Zustand (state management)
- Tauri 2 + Rust workspace crates
- FFmpeg/FFprobe for media processing

## Prerequisites

Install:
- Node.js 18+
- Rust (stable toolchain)
- Tauri platform prerequisites: https://v2.tauri.app/start/prerequisites/
- FFmpeg (must provide both `ffmpeg` and `ffprobe` on `PATH`): https://ffmpeg.org/download.html

## Install

```bash
npm install
```

## Run in development

```bash
npm run tauri:dev
```

Notes:
- Tauri is configured to run the frontend dev server at `http://localhost:1420`.
- On startup, FrameCut checks for FFmpeg/FFprobe and shows an in-app warning if missing.

## Build

Frontend build only:

```bash
npm run build
```

Desktop app bundle:

```bash
npm run tauri:build
```

## Useful scripts

- `npm run dev` - Vite dev server only
- `npm run tauri:dev` - Full desktop app in dev mode
- `npm run lint` - ESLint on `src/`
- `npm run format` - Prettier write on `src/`
- `npm run format:check` - Prettier check on `src/`

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
