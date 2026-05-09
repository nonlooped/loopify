# Codebase Audit — Refactoring Changes

**Date:** 2026-05-09  
**Commits:** `fb646a4` `f3bf54c` `101f1c4`  
**Net change:** 38 files, +522 / −810 lines  

---

## Dead Code Removed

### Main process — Unused exports, methods, and schema tables

| File | What was removed |
|------|-----------------|
| `src/main/db/types.ts` | 8 unused type exports: `DbAlbumTrack`, `DbTrackSource`, `DbPlaylist`, `DbPlaylistTrack`, `DbImportItem`, `DbPlayHistory`, `DbSettings`, `DbResolverCache` and their schema imports (`albumTracks`, `importItems`, `playlists`, `playlistTracks`, `playHistory`, `settings`, `resolverCache`, `trackSources`) |
| `src/main/db/schema.ts` | 2 unused table definitions: `albumTracks`, `importItems` |
| `src/main/db/database.ts` | `deleteDatabase()` function and `copyDirRecursive()` helper (replaced by `fs.cpSync`) |
| `src/main/db/repositories.ts` | 3 unused methods: `saveCandidateInTransaction()`, `recordPlayStart()`, `markPlayHistoryCompleted()` |
| `src/main/resolver/resolver-service.ts` | `listPlaylist()` method (consumers use `listPlaylistWithMetadata` directly); un-exported `YT_FORMAT_PLAY` |
| `src/main/music/query-builders.ts` | `isHttpUrl()` and `buildYtdlpSourceArgForSearch()` — never imported externally |
| `src/main/library/spotify-import-matching.ts` | Un-exported `DEFAULT_MATCH_SCORE_THRESHOLD` and `SEARCH_TIMEOUT_MS` |
| `src/main/library/playlist-source.ts` | Removed `DEFAULT_IMPORT_MAX` entirely (was unused after un-exporting) |
| `src/main/resolver/youtube-source-matcher.ts` | Un-exported `ScoredEntry`, `MATCH_THRESHOLD`, `scoreEntry` |

### Shared / Preload — Dead IPC contract and types

| File | What was removed |
|------|-----------------|
| `src/shared/contracts/ipc.ts` | `DownloadProgressPatch` type, `onProgressChange` API on `LoopifyApi.downloads`, `providers?` field on `SearchQuery` |
| `src/shared/types/music.ts` | Un-exported `TrackLyrics`, `StaticTrackLyrics`, `ImportPhase` (only used internally in union types) |
| `src/preload/index.ts` | Dead progress-change event wiring (`onProgressChange` implementation, `DownloadProgressPatch` import) |
| `src/main/app.ts` | `onProgressChanged` callback from `DownloadService` constructor |
| `src/main/library/download-service.ts` | `DownloadProgressPatch` import, `onProgressChanged` from `DownloadEvents` type |
| `src/main/ipc/register-handlers.ts` | `providers` validation from search query handler |

### Renderer — Dead state, exports, and components

| File | What was removed |
|------|-----------------|
| `src/renderer/stores/app.store.ts` | `SearchTab` type, `searchQuery`/`searchResults`/`searchLoading`/`searchError`/`searchTab` state, `performSearch`/`setSearchTab`/`clearSearch` actions, `trackRecommendationImpression` action, `CatalogSearchResult` import |
| `src/renderer/features/library/DiscoverSection.tsx` | Redundant `export default DiscoverSection` (named export kept) |
| `src/renderer/lib/drag-drop.ts` | Unused `PLAYLIST_ENTRY` MIME type constant |
| `src/renderer/hooks/useFocusTrap.ts` | Entire file deleted (69 lines) — replaced by `focus-trap-react` package |

---

## Reinvented Wheels Replaced

| What | Location | Replaced with |
|------|----------|--------------|
| Manual focus trap (69 lines) | `renderer/hooks/useFocusTrap.ts` | `focus-trap-react` package (already installed, used elsewhere) |
| Manual Fisher-Yates shuffle | `renderer/stores/app.store.ts` | `lodash-es` `shuffle` (already a dependency) |
| Manual `uniqueBySource()` | `main/library/import-service.ts` | `lodash-es` `uniqBy` (already a dependency) |
| Manual `copyDirRecursive()` | `main/db/database.ts` | Node 22 `fs.cpSync(path, dest, { recursive: true })` |
| 3 separate token-overlap implementations | `shared/utils/string.ts`, `catalog/deezer-service.ts`, `library/spotify-import-matching.ts` | Consolidated into shared `tokenOverlapRatio()` + `durationSimilarity()` in `shared/utils/string.ts` |
| 2 separate `normalize()` functions | `shared/utils/string.ts` vs `catalog/deezer-service.ts` | Unified to shared `normalize()` |
| 3 separate duration-similarity functions | `spotify-import-matching.ts`, `youtube-source-matcher.ts`, `deezer-service.ts` | Consolidated into shared `durationSimilarity()` |

---

## Duplicated Logic Consolidated

### New shared utilities created

| New file | Purpose | Replaces |
|----------|---------|----------|
| `src/renderer/lib/format-time.ts` | `formatSeconds(secs)` — seconds-to-M:SS formatting | 4 inline copies in `FloatingIsland.tsx`, `CommandPalette.tsx`, `SyncedLyricsView.tsx`, `music-format.ts` |
| `src/renderer/hooks/useResolver.ts` | `useResolver()` hook — shared catalog resolution + resolvingId state | 3 duplicated `withResolution` callbacks in `CommandPalette.tsx`, `AlbumPage.tsx`, `ArtistPage.tsx` |
| `src/renderer/lib/navigation.ts` | `getBackLabel()` — library view back-label helper | 2 identical copies in `AlbumPage.tsx`, `ArtistPage.tsx` |
| `src/renderer/lib/download-utils.ts` | `isDownloadBusy()` — download status helper | 3 inline checks in `Workspace.tsx`, `FloatingIsland.tsx`, `QueueOverlay.tsx` |
| `src/main/shared/resolve-binary.ts` | `resolveBinaryPath()` — unified binary resolution logic | 2 near-identical files `mpv-binary.ts`, `resolve-ytdlp.ts` |

### Other consolidations

| Pattern | Before | After |
|---------|--------|-------|
| 2 `DeezerService` instances with separate caches | Created separately in `ResolverService` and `spotify-import-matching.ts` | Single instance created in `app.ts`, injected via constructor |
| Array reorder pattern | Duplicated splice-sort logic in `moveTrackInPlaylist()` and `QueueRepository.move()` | Shared `reorderItems()` helper in `repositories.ts` |
| Modal dismiss (ESC + backdrop) | `PlaylistActionModal.tsx` manually implemented ESC/backdrop dismiss | Uses shared `useModalDismiss` hook |
| `formatTrackDuration()` in `music-format.ts` | Self-contained formatting logic | Delegates to `formatSeconds()` from new `format-time.ts` |
| `PlaylistActionModal.tsx` dismiss logic | Manual ESC + backdrop handlers | `useModalDismiss` hook (already used by `ImportModal`, `CommandPalette`, `ShortcutsOverlay`) |

---

## Files Changed Summary

```
 src/main/app.ts                                    |  12 +-
 src/main/catalog/deezer-service.ts                 |  36 +-
 src/main/db/database.ts                            |  22 +-
 src/main/db/repositories.ts                        |  21 +-
 src/main/db/schema.ts                              |  38 --
 src/main/db/types.ts                               |  25 +-
 src/main/ipc/register-handlers.ts                   |   7 +-
 src/main/library/download-service.ts                |   2 -
 src/main/library/import-service.ts                  |  22 +-
 src/main/library/playlist-source.ts                  |   2 -
 src/main/library/spotify-import-matching.ts          |  58 +--
 src/main/music/query-builders.ts                    |  14 -
 src/main/player/mpv-binary.ts                       |  26 +-
 src/main/resolver/resolve-ytdlp.ts                   |  19 +-
 src/main/resolver/resolver-service.ts                |  18 +-
 src/main/resolver/youtube-source-matcher.ts          |  24 +-
 src/main/shared/resolve-binary.ts                    |  26 ++
 src/preload/index.ts                                 |  13 +-
 src/renderer/features/library/AlbumPage.tsx           |  73 ++--
 src/renderer/features/library/ArtistPage.tsx           |  78 ++--
 src/renderer/features/library/DiscoverSection.tsx       |   2 -
 src/renderer/features/library/Workspace.tsx             |   9 +-
 src/renderer/features/player/FloatingIsland.tsx         | 410 ++++++++++-----------
 src/renderer/features/player/QueueOverlay.tsx            |   8 +-
 src/renderer/features/player/SyncedLyricsView.tsx        |   9 +-
 src/renderer/features/shell/CommandPalette.tsx           | 115 +++---
 src/renderer/features/shell/PlaylistActionModal.tsx      |  24 +-
 src/renderer/hooks/useFocusTrap.ts                       |  69 ----
 src/renderer/hooks/useResolver.ts                        |  21 ++
 src/renderer/lib/context-menu-items.tsx                  |   5 +-
 src/renderer/lib/download-utils.ts                        |   3 +
 src/renderer/lib/drag-drop.ts                              |   1 -
 src/renderer/lib/format-time.ts                            |   5 +
 src/renderer/lib/navigation.ts                             |  17 +
 src/renderer/stores/app.store.ts                           |  59 +--
 src/shared/contracts/ipc.ts                                |  10 -
 src/shared/types/music.ts                                   |   6 +-
 src/shared/utils/string.ts                                  |  23 ++
 38 files changed, 522 insertions(+), 810 deletions(-)
```

---

## Risks / Required Fixes

### HIGH — Binary resolution regression (FIXED)

The `resolveBinaryPath` refactor introduced a double-platform-directory bug. `resolveBundledBinary()` already appends `${process.platform}-${process.arch}` to the `binaryDir`, but the new callers passed `mpv/win-x64` and `yt-dlp/win-x64` as `binaryDir`, producing paths like `binaries/mpv/win-x64/win32-x64/mpv.exe` instead of the correct `binaries/mpv/win32-x64/mpv.exe`.

Additionally, `binaryName` was hardcoded to `mpv.exe` / `yt-dlp.exe` instead of using `process.platform === "win32"` conditional logic, breaking macOS/Linux.

**Both issues have been fixed** in `mpv-binary.ts` and `resolve-ytdlp.ts` — `binaryDir` is now `"mpv"` / `"yt-dlp"` and `binaryName` uses the platform conditional.

### MEDIUM — Removed exports may have external consumers

`SearchQuery.providers`, `downloads.onProgressChange`, 2 schema table definitions, and several type exports were removed. These are **intended** as internal-only removals, but without a consumer audit across the full dependency tree, the claim "no behavior changes" should be scoped to "no intended user-facing behavior changes."

### MEDIUM — `resolveMpvPath` signature changed

The refactored `resolveMpvPath` accepts `settingsPath: string | undefined` instead of the original `settingsPath: string`. Any caller passing a bare `string` is fine, but the type broadened — verify no callers relied on the stricter type.

## Verification

| Check | Result |
|-------|--------|
| `pnpm run lint` (Biome) | Passed — 83 files, no issues |
| `pnpm run typecheck` (`tsc --noEmit`) | Passed — no errors |
| `pnpm run build` | Not yet run (requires full electron-vite build; should be run before release) |

## Breaking Changes

No intended user-facing behavior changes. The refactor is internal-only. See **Risks** section above for the binary regression that was identified and fixed during this audit.