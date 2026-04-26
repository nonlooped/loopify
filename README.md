# Loopify Desktop

Personal desktop music app for searching, resolving, queueing, importing, and playing online music sources through a local web UI.

## Stack

- Electron main process for playback, resolving, persistence, and native process control.
- React + Vite renderer for the desktop web UI.
- SQLite through `better-sqlite3` for local data.
- `mpv` for playback through JSON IPC.
- `yt-dlp` for source resolving, search, and playlist imports.

## Commands

```bash
pnpm install
pnpm run dev
pnpm run typecheck
pnpm run build
pnpm run dist:win
```

If native packages were installed with lifecycle scripts disabled, rebuild them:

```bash
pnpm rebuild electron better-sqlite3
```

## Runtime Prerequisites

You must install these on the host system before running Loopify:

### yt-dlp

```bash
yt-dlp --version
```

### mpv

Loopify requires `mpv` for audio playback. It resolves `mpv` in this order:

1. `LOOPIFY_MPV_PATH` environment variable
2. Bundled binary from `resources/binaries/mpv/<platform>-<arch>/`
3. `settings.mpvPath` from the app settings

**Bring your own mpv:** Download from [mpv.io](https://mpv.io) and place the executable at:
- Windows: `resources\binaries\mpv\win32-x64\mpv.exe`
- macOS: `resources/binaries/mpv/darwin-arm64/mpv` or `darwin-x64/mpv`
- Linux: `resources/binaries/mpv/linux-x64/mpv`

Or simply ensure `mpv` (or `mpv.exe` on Windows) is available in your system PATH.

## Project Shape

- `src/main` owns Electron, SQLite, resolver jobs, queue/library repositories, and `mpv` control.
- `src/preload` exposes the typed renderer API through `contextBridge`.
- `src/renderer` contains the React UI.
- `src/shared` contains IPC contracts and shared music types.
- `drizzle/schema.ts` mirrors the SQLite data model for future migrations.