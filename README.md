<div align="center">

# Loopify Desktop

### A personal desktop music app for searching, resolving, queueing, and playing music from online sources.

[![License: MIT](https://img.shields.io/badge/license-MIT-326ce5?style=flat-square)](./LICENSE)
[![Electron](https://img.shields.io/badge/electron-342f4a?style=flat-square&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/react-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Windows](https://img.shields.io/badge/Windows-0078d4?style=flat-square&logo=windows&logoColor=white)](https://github.com/nonlooped/loopify/releases)
[![macOS](https://img.shields.io/badge/macOS-000000?style=flat-square&logo=apple&logoColor=white)](https://github.com/nonlooped/loopify/releases)
[![Linux](https://img.shields.io/badge/Linux-fcc624?style=flat-square&logo=linux&logoColor=black)](https://github.com/nonlooped/loopify/releases)

<br />

[Documentation](https://github.com/nonlooped/loopify/wiki) · [Issues](https://github.com/nonlooped/loopify/issues)

</div>

---

```bash
pnpm install
pnpm run dev
```

---

## The Problem

Most music apps require a subscription, lock you into their library, or force you to manually download tracks. You might have playlists scattered across Spotify, YouTube, and SoundCloud, but there's no single place to search, queue, and play them all without switching apps.

**Loopify solves this** by treating the open web as your library. Search and play directly from YouTube, SoundCloud, and other online sources without subscriptions and without leaving your desktop. Optionally download tracks for offline playback.

---

## Features

- **Universal Search** - Search across YouTube, SoundCloud, and other supported sources
- **Playlist Import** - Import public Spotify playlists and YouTube playlist links
- **Synced Lyrics** - Display synchronized lyrics when available
- **Discord Presence** - Show what you're listening to in your Discord status
- **Local Library** - Save tracks, create playlists, and manage your queue locally
- **Keyboard Shortcuts** - Global media keys and in-app controls

---

## Install

Loopify bundles everything you need except the runtime dependencies.

```bash
pnpm install
pnpm run dev
```

<details>
<summary><b>Details</b> - building for distribution</summary>

```bash
# Build for Windows
pnpm run dist:win

# Build for macOS
pnpm run dist:mac

# Build for Linux
pnpm run dist:linux
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
- macOS: `resources\binaries\mpv\darwin-arm64/mpv` or `darwin-x64/mpv`
- Linux: `resources/binaries/mpv/linux-x64/mpv`

### yt-dlp

Source resolver for fetching stream URLs and metadata. Loopify resolves `yt-dlp` in this order:

1. Bundled binary from `resources/binaries/yt-dlp/<platform>-<arch>/`
2. `settings.ytdlpPath` from app settings
3. System PATH

**Bring your own yt-dlp:** Download from [github.com/yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) and place the executable at:

- Windows: `resources\binaries\yt-dlp\win32-x64\yt-dlp.exe`
- macOS: `resources/binaries/yt-dlp/darwin-arm64/yt-dlp` or `darwin-x64/yt-dlp`
- Linux: `resources/binaries/yt-dlp/linux-x64/yt-dlp`

---

## Project Structure

| Path                          | Role                                                    |
| ----------------------------- | ------------------------------------------------------- |
| `src/main`                    | Electron main process, SQLite, mpv control, resolver jobs |
| `src/main/db`                 | Drizzle ORM schema, repositories, SQLite migrations, setup |
| `src/main/player`             | mpv playback control via JSON IPC                       |
| `src/main/resolver`           | Stream URL resolution with yt-dlp                       |
| `src/main/library`            | Import services, playlist sources, download handling    |
| `src/main/lyrics`             | Synchronized lyrics fetching and parsing                |
| `src/main/recommendations`    | Music recommendation engine                             |
| `src/main/catalog`            | Music catalog services, including Deezer                |
| `src/main/presence`           | Discord Rich Presence integration                       |
| `src/main/updater`            | Auto-update handling                                    |
| `src/preload`                 | Typed API bridge via `contextBridge`                    |
| `src/renderer`                | React + Vite UI                                         |
| `src/renderer/features/shell` | App shell, navigation, settings, modals                 |
| `src/renderer/features/player` | Player controls, queue, lyrics display                 |
| `src/renderer/features/library` | Library pages, discover, playlists, albums, artists   |
| `src/shared`                  | IPC contracts and shared music types                    |

---

## Commands

| Script                      | Purpose                                |
| --------------------------- | -------------------------------------- |
| `pnpm run dev`              | Start with hot reload                  |
| `pnpm run build`            | Build all bundles                      |
| `pnpm run preview`          | Preview production build               |
| `pnpm run postinstall`      | Rebuild native modules automatically   |
| `pnpm run typecheck`        | Type-check without emitting            |
| `pnpm run lint`             | Lint with Biome                        |
| `pnpm run lint:fix`         | Auto-fix Biome issues                  |
| `pnpm run format`           | Format code with Biome                 |
| `pnpm run smoke:win`        | Windows dir build without code signing |
| `pnpm run db:generate`      | Generate Drizzle migrations            |
| `pnpm run db:migrate`       | Apply pending migrations               |
| `pnpm run db:verify`        | Verify Drizzle migrations              |
| `pnpm run verify:mpv`       | Verify mpv binary setup                |
| `pnpm run prepare:binaries` | Bundle external binaries               |
| `pnpm run dist:win`         | Build Windows NSIS installer           |
| `pnpm run dist:mac`         | Build macOS dmg+zip                    |
| `pnpm run dist:linux`       | Build Linux AppImage/tar.gz            |
| `pnpm run dist:win:dir`     | Build Windows dir without installer    |
| `pnpm run dist:linux:dir`   | Build Linux dir without installer      |

If native packages were installed with lifecycle scripts disabled, rebuild them:

```bash
pnpm rebuild electron better-sqlite3
```

---

## FAQ

**Is this free?** Yes - MIT licensed and fully open source.

**Where does the music play from?** Loopify streams directly from YouTube, SoundCloud, and other online sources via `yt-dlp`. Tracks can optionally be downloaded for offline playback.

**Can I use my own mpv binary?** Yes. Place it in `resources/binaries/mpv/<platform>-<arch>/` or set `LOOPIFY_MPV_PATH`.

**Does it work on macOS and Linux?** Yes. The build commands support all three platforms.

---

## Contributing

Open an issue or PR on [GitHub](https://github.com/nonlooped/loopify). Run `pnpm run lint` and `pnpm run typecheck` before submitting.

## License

MIT - see `LICENSE`.
