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
npm install
npm run dev
npm run typecheck
npm run build
npm run dist:win
```

If native packages were installed with lifecycle scripts disabled, rebuild them:

```bash
npm rebuild electron better-sqlite3
```

## Runtime Prerequisites

Install this on the host system:

```bash
yt-dlp --version
```

`mpv` is bundled for packaged builds. For development, Loopify resolves `mpv` in this order:

1. `LOOPIFY_MPV_PATH` environment variable
2. Bundled binary from `resources/binaries/mpv/<platform>-<arch>/`
3. `settings.mpvPath` from the app settings

To ship Windows installer builds, provide:

- `resources/binaries/mpv/win32-x64/mpv.exe`

Linux/WSL also needs Electron's shared-library dependencies. If Electron fails with `libnss3.so`, install the matching OS package, usually `libnss3`.

## Project Shape

- `src/main` owns Electron, SQLite, resolver jobs, queue/library repositories, and `mpv` control.
- `src/preload` exposes the typed renderer API through `contextBridge`.
- `src/renderer` contains the React UI.
- `src/shared` contains IPC contracts and shared music types.
- `drizzle/schema.ts` mirrors the SQLite data model for future migrations.
