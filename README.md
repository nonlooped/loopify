<div align="center">

# Loopify Desktop

### A personal desktop music app for searching, resolving, queueing, importing, and playing music from online sources.

[![License: MIT](https://img.shields.io/badge/license-MIT-326ce5?style=flat-square)](./LICENSE)
[![Electron](https://img.shields.io/badge/electron-342f4a?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/react-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Windows](https://img.shields.io/badge/Windows-0078d4?style=flat-square&logo=windows&logoColor=white)](https://github.com/unloopedmido/loopify/releases)
[![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)](https://github.com/unloopedmido/loopify/releases)
[![Linux](https://img.shields.io/badge/Linux-fcc624?style=flat-square&logo=linux&logoColor=black)](https://github.com/unloopedmido/loopify/releases)

<br />

[Documentation](https://github.com/unloopedmido/loopify/wiki) · [Issues](https://github.com/unloopedmido/loopify/issues) · [Changelog](./CHANGELOG.md)

</div>

---

```bash
pnpm install
pnpm run dev
```

---

## The Problem

Most music apps require a subscription, lock you into their library, or force you to manually download tracks. You might have playlists scattered across Spotify, YouTube, and SoundCloud—but there's no single place to search, queue, and play them all without switching apps.

**Loopify solves this** by treating the open web as your library. Search and play directly from YouTube, SoundCloud, and other online sources—without downloading, without subscriptions, and without leaving your desktop.

---

## Features

- **Universal Search** — Search across YouTube, SoundCloud, and other supported sources
- **Playlist Import** — Import playlists from Spotify, YouTube, and other platforms
- **Synced Lyrics** — Display synchronized lyrics when available
- **Discord Presence** — Show what you're listening to in your Discord status
- **Local Library** — Save tracks, create playlists, and manage your queue locally
- **Keyboard Shortcuts** — Global media keys and in-app controls

---

## Install

Loopify bundles everything you need except the runtime dependencies.

```bash
pnpm install
pnpm run dev
```

<details>
<summary><b>Details</b> — building for distribution</summary>

```bash
# Build for Windows
pnpm run dist:win

# Build for macOS
pnpm run dist:mac
```

Output binaries are written to the `release` folder.

</details>

---

## Runtime Prerequisites

Loopify requires two external tools on the host system:

### mpv

Audio playback engine. Loopify resolves `mpv` in this order:

1. `LOOPIFY_MPV_PATH` environment variable
2. Bundled binary from `resources/binaries/mpv/<platform>-<arch>/`
3. `settings.mpvPath` from app settings
4. System PATH

**Bring your own mpv:** Download from [mpv.io](https://mpv.io) and place the executable at:
- Windows: `resources\binaries\mpv\win32-x64\mpv.exe`
- macOS: `resources/binaries/mpv/darwin-arm64/mpv` or `darwin-x64/mpv`
- Linux: `resources/binaries/mpv/linux-x64/mpv`

### yt-dlp

Source resolver for fetching stream URLs and metadata.

```bash
yt-dlp --version
```

---

## Project Structure

| Path               | Role                                                         |
| ------------------ | ------------------------------------------------------------ |
| `src/main`         | Electron main process, SQLite, mpv control, resolver jobs  |
| `src/preload`      | Typed API bridge via `contextBridge`                        |
| `src/renderer`     | React + Vite UI                                             |
| `src/shared`       | IPC contracts and shared music types                        |
| `drizzle/schema.ts`| SQLite data model for migrations                            |

---

## Commands

| Script           | Purpose                                |
| ---------------- | -------------------------------------- |
| `pnpm run dev`   | Start with hot reload                  |
| `pnpm run build` | Build all bundles                      |
| `pnpm run typecheck` | Type-check without emitting        |
| `pnpm run lint`  | Lint with Biome                        |
| `pnpm run dist:win` | Build Windows NSIS installer       |
| `pnpm run dist:mac` | Build macOS distributable          |

If native packages were installed with lifecycle scripts disabled, rebuild them:

```bash
pnpm rebuild electron better-sqlite3
```

---

## FAQ

**Is this free?** Yes—MIT licensed and fully open source.

**Where does the music play from?** Loopify streams directly from YouTube, SoundCloud, and other online sources via `yt-dlp`. No local storage required.

**Can I use my own mpv binary?** Yes. Place it in `resources/binaries/mpv/<platform>/` or set `LOOPIFY_MPV_PATH`.

**Does it work on macOS and Linux?** Yes. The build commands support all three platforms.

---

## Contributing

Open an issue or PR on [GitHub](https://github.com/unloopedmido/loopify). Run `pnpm run lint` and `pnpm run typecheck` before submitting.

## License

MIT — see `LICENSE`.