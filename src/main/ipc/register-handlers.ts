import { existsSync } from "node:fs"
import { app, type BrowserWindow, ipcMain } from "electron"
import { z } from "zod"
import { ipcChannels } from "../../shared/contracts/ipc"
import type {
  CatalogTrack,
  PlayerPosition,
  PlayerTrack,
  QueueItem,
  RepeatMode,
  Track,
  TrackCandidate,
} from "../../shared/types/music"
import type { LibraryRepository, QueueRepository, SettingsRepository } from "../db/repositories"
import type { DownloadService } from "../library/download-service"
import type { ImportService } from "../library/import-service"
import type { LyricsService } from "../lyrics/lyrics-service"
import type { PlayerService } from "../player/player-service"
import type { DiscordPresenceService } from "../presence/discord-presence-service"
import type { RecommendationService } from "../recommendations/recommendation-service"
import type { ResolverService } from "../resolver/resolver-service"
import type { UpdaterService } from "../updater/updater-service"

type HandlerDeps = {
  window: BrowserWindow
  player: PlayerService
  resolver: ResolverService
  queue: QueueRepository
  library: LibraryRepository
  imports: ImportService
  downloads: DownloadService
  lyrics: LyricsService
  settings: SettingsRepository
  presence: DiscordPresenceService
  updater: UpdaterService
  recommendations: RecommendationService
}

let cleanupPreviousHandlers: (() => void) | null = null
let playerEmitCount = 0

const nonEmptyString = z.string().trim().min(1)
const nullableNonEmptyString = z.string().trim().min(1).nullable()
const catalogTrackSchema = z.object({
  catalogProvider: z.literal("deezer"),
  catalogId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  artistDeezerId: z.number().optional(),
  album: z.string().nullable(),
  albumDeezerId: z.number().optional(),
  artworkUrl: z.string().nullable(),
  durationMs: z.number().int().positive(),
  isrc: z.string().nullable(),
})
const providerSchema = z.enum(["youtube", "soundcloud", "bandcamp", "direct", "unknown"])
const playerTrackSchema = z.object({
  id: z.string().optional(),
  title: nonEmptyString,
  artist: nullableNonEmptyString,
  album: nullableNonEmptyString,
  durationMs: z.number().int().nonnegative().nullable(),
  thumbnailUrl: z.string().nullable(),
  canonicalUrl: nonEmptyString,
  provider: providerSchema,
  likedAt: z.number().int().nullable().optional(),
  downloadStatus: z.string().optional(),
  downloadedFilePath: z.string().nullable().optional(),
})
const repeatModeSchema = z.enum(["off", "one", "all"])
const trackCandidateSchema = z.object({
  title: nonEmptyString,
  artist: nullableNonEmptyString,
  album: nullableNonEmptyString,
  durationMs: z.number().int().nonnegative().nullable(),
  thumbnailUrl: z.string().nullable(),
  sourceUrl: nonEmptyString,
  canonicalUrl: nonEmptyString,
  provider: providerSchema,
  sourceId: z.string().nullable(),
  extractor: z.string().nullable(),
})

export function registerIpcHandlers(deps: HandlerDeps): void {
  cleanupPreviousHandlers?.()
  cleanupPreviousHandlers = null

  const ipcOn = (channel: string, listener: Parameters<typeof ipcMain.on>[1]) => {
    ipcMain.removeAllListeners(channel)
    ipcMain.on(channel, listener)
  }

  const ipcHandle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]) => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, listener)
  }

  const emitQueue = (): QueueItem[] => {
    const queue = deps.queue.list()
    deps.window.webContents.send(ipcChannels.queueChanged, queue)
    return queue
  }

  // ── Window controls ────────────────────────────────────────────────
  ipcOn(ipcChannels.windowMinimize, () => deps.window.minimize())
  ipcOn(ipcChannels.windowMaximize, () => deps.window.maximize())
  ipcOn(ipcChannels.windowUnmaximize, () => deps.window.unmaximize())
  ipcOn(ipcChannels.windowClose, () => deps.window.close())
  ipcHandle(ipcChannels.windowIsMaximized, () => deps.window.isMaximized())

  const onWindowMaximize = () => {
    deps.window.webContents.send(ipcChannels.windowMaximizedChanged, true)
  }
  const onWindowUnmaximize = () => {
    deps.window.webContents.send(ipcChannels.windowMaximizedChanged, false)
  }
  deps.window.on("maximize", onWindowMaximize)
  deps.window.on("unmaximize", onWindowUnmaximize)

  const getDownloadedPlaybackPath = (track: Track): string | null => {
    if (track.downloadStatus !== "downloaded" || !track.downloadedFilePath) {
      return null
    }
    return existsSync(track.downloadedFilePath) ? track.downloadedFilePath : null
  }

  const maybeStartFirstQueuedItem = async (): Promise<QueueItem[]> => {
    const state = deps.player.getState()
    if (state.queueItemId || state.status === "playing" || state.status === "paused") {
      return deps.queue.list()
    }

    const first = deps.queue.list()[0]
    if (!first) {
      return deps.queue.list()
    }

    await playQueueItem(first.id)
    return emitQueue()
  }

  const resolveQueueItemInBackground = (item: { id: string; sourceUrl: string }) => {
    deps.queue.setStatus(item.id, "resolving")
    emitQueue()
    void deps.resolver
      .resolve(item.sourceUrl)
      .then((resolved) => {
        const track = deps.library.upsertTrack(resolved.candidate)
        deps.queue.setTrack(item.id, track.id, "ready")
        emitQueue()
      })
      .catch(() => {
        deps.queue.setStatus(item.id, "failed")
        emitQueue()
      })
  }

  const prefetchNextQueueItem = (afterId: string): void => {
    const nextId = deps.queue.nextItemId(afterId)
    if (!nextId) return
    const next = deps.queue.get(nextId)
    if (!next) return
    if (next.track) return
    if (next.status === "resolving" || next.status === "ready") return
    resolveQueueItemInBackground({ id: next.id, sourceUrl: next.sourceUrl })
  }

  const playQueueItem = async (queueItemId: string) => {
    const item = deps.queue.get(nonEmptyString.parse(queueItemId))
    if (!item) throw new Error("Queue item was not found.")

    const downloadedPath = item.track ? getDownloadedPlaybackPath(item.track) : null
    if (item.track && downloadedPath) {
      deps.queue.clearPlaying()
      deps.queue.setTrack(item.id, item.track.id, "playing")
      emitQueue()
      const result = await deps.player.play(downloadedPath, item.id, item.track)
      prefetchNextQueueItem(item.id)
      return result
    }

    deps.queue.setStatus(item.id, "resolving")
    emitQueue()
    try {
      const resolved = await deps.resolver.resolve(item.sourceUrl)
      const track = deps.library.upsertTrack(resolved.candidate)
      const playbackPath = getDownloadedPlaybackPath(track) ?? resolved.streamUrl
      if (!playbackPath) {
        deps.queue.setTrack(item.id, track.id, "failed")
        emitQueue()
        throw new Error("Resolver did not return a playable stream URL.")
      }

      deps.queue.clearPlaying()
      deps.queue.setTrack(item.id, track.id, "playing")
      emitQueue()
      const result = await deps.player.play(playbackPath, item.id, track)
      prefetchNextQueueItem(item.id)
      return result
    } catch (error) {
      deps.queue.setStatus(item.id, "failed")
      emitQueue()
      throw error
    }
  }

  let lastMetadataJson = ""
  let lastPositionEmitAt = 0
  const POSITION_EMIT_THROTTLE_MS = 250

  deps.player.on("state", (state) => {
    playerEmitCount++
    if (playerEmitCount % 10 === 0) {
      console.debug("[perf] player:state-changed emit #", playerEmitCount)
    }
    deps.presence.sync(state)
    if (state.status === "idle" && state.queueItemId) {
      const finishedId = state.queueItemId
      const repeatMode = state.repeatMode ?? "off"
      const list = deps.queue.list()
      const nextId =
        repeatMode === "one"
          ? finishedId
          : (deps.queue.nextItemId(finishedId) ??
            (repeatMode === "all" ? (list[0]?.id ?? null) : null))
      if (nextId) {
        void playQueueItem(nextId).catch((err) => {
          console.error("Queue advance after track end failed", err)
        })
      } else {
        deps.queue.clearPlaying()
        emitQueue()
        deps.player.clearNowPlayingAfterTrackEnded()
      }
    }

    const { positionSeconds, durationSeconds, ...metadata } = state
    const metadataJson = JSON.stringify(metadata)
    if (metadataJson !== lastMetadataJson) {
      lastMetadataJson = metadataJson
      deps.window.webContents.send(ipcChannels.playerStateChanged, state)
    }

    const position: PlayerPosition = {
      positionSeconds,
      durationSeconds: state.durationSeconds,
      bufferedDuration: 0,
    }
    const now = Date.now()
    if (now - lastPositionEmitAt >= POSITION_EMIT_THROTTLE_MS) {
      lastPositionEmitAt = now
      deps.window.webContents.send(ipcChannels.playerPositionChanged, position)
    }
  })

  ipcHandle(ipcChannels.playerGetState, () => deps.player.getState())
  ipcHandle(ipcChannels.playerPause, () => deps.player.pause())
  ipcHandle(ipcChannels.playerResume, () => deps.player.resume())
  ipcHandle(ipcChannels.playerStop, async () => {
    const state = deps.player.getState()
    if (!state.queueItemId) {
      return deps.player.stop()
    }

    if (state.status === "playing") {
      await deps.player.pause()
    }

    return deps.player.seek(0)
  })
  ipcHandle(ipcChannels.playerSeek, (_event, seconds) =>
    deps.player.seek(z.number().min(0).parse(seconds))
  )
  ipcHandle(ipcChannels.playerSetVolume, (_event, volume) =>
    deps.player.setVolume(z.number().min(0).max(100).parse(volume))
  )
  ipcHandle(ipcChannels.playerSetRepeatMode, (_event, mode) =>
    deps.player.setRepeatMode(repeatModeSchema.parse(mode) as RepeatMode)
  )
  ipcHandle(ipcChannels.playerPlay, (_event, queueItemId) => playQueueItem(queueItemId))

  ipcHandle(ipcChannels.searchQuery, (_event, input) => {
    const parsed = z
      .object({ text: nonEmptyString, providers: z.array(z.string()).optional() })
      .parse(input)
    if (parsed.providers && parsed.providers.length > 0 && !parsed.providers.includes("deezer")) {
      return []
    }
    return deps.resolver.search(parsed.text)
  })
  ipcHandle(ipcChannels.searchQueryTracks, (_event, q) =>
    deps.resolver.searchTracks(nonEmptyString.parse(q))
  )
  ipcHandle(ipcChannels.searchQueryArtists, (_event, q) =>
    deps.resolver.searchArtists(nonEmptyString.parse(q))
  )
  ipcHandle(ipcChannels.searchQueryAlbums, (_event, q) =>
    deps.resolver.searchAlbums(nonEmptyString.parse(q))
  )
  ipcHandle(ipcChannels.catalogGetArtist, (_event, deezerId) =>
    deps.resolver.getArtist(z.number().int().positive().parse(deezerId))
  )
  ipcHandle(ipcChannels.catalogGetAlbum, (_event, deezerId) =>
    deps.resolver.getAlbum(z.number().int().positive().parse(deezerId))
  )
  ipcHandle(ipcChannels.catalogGetTrackNavInfo, async (_event, trackId) => {
    const parsedTrackId = nonEmptyString.parse(trackId)
    const local = deps.library.getTrackNavInfo(parsedTrackId)
    if (local?.albumDeezerId != null || local?.artistDeezerId != null) {
      return local
    }

    const track = deps.library.getTrack(parsedTrackId)
    if (!track) return null

    const query = [track.title, track.artist].filter(Boolean).join(" ")
    if (!query) return null

    try {
      const hits = await deps.resolver.searchTracks(query)
      const hit = hits[0]
      if (!hit) return null
      const result: { artistDeezerId?: number; albumDeezerId?: number } = {}
      if (hit.artistDeezerId != null) result.artistDeezerId = hit.artistDeezerId
      if (hit.albumDeezerId != null) result.albumDeezerId = hit.albumDeezerId
      return Object.keys(result).length > 0 ? result : null
    } catch {
      return null
    }
  })
  ipcHandle(ipcChannels.resolverResolve, (_event, input) =>
    deps.resolver.resolve(nonEmptyString.parse(input))
  )
  ipcHandle(ipcChannels.resolverResolveCatalog, (_event, input) =>
    deps.resolver.resolveCatalog(catalogTrackSchema.parse(input) as CatalogTrack)
  )

  ipcHandle(ipcChannels.queueList, () => {
    const start = performance.now()
    const result = deps.queue.list()
    const elapsed = performance.now() - start
    console.debug("[perf] queue:list", elapsed.toFixed(1), "ms")
    return result
  })
  ipcHandle(ipcChannels.queueAdd, async (_event, input) => {
    const parsed = z
      .object({ sourceUrl: nonEmptyString, playNow: z.boolean().optional() })
      .parse(input)
    const start = performance.now()
    const effectiveUrl =
      deps.library.findSourceUrlByCanonicalUrl(parsed.sourceUrl) ?? parsed.sourceUrl
    if (parsed.playNow) {
      await deps.player.stop()
      deps.queue.clear()
      emitQueue()
    }
    const queue = deps.queue.add(effectiveUrl)
    const item = queue[queue.length - 1]
    if (parsed.playNow && item) {
      await playQueueItem(item.id)
      const result = emitQueue()
      const elapsed = performance.now() - start
      console.debug("[perf] queue:add", elapsed.toFixed(1), "ms")
      return result
    }
    if (item) {
      resolveQueueItemInBackground({ id: item.id, sourceUrl: item.sourceUrl })
      const result = maybeStartFirstQueuedItem()
      const elapsed = performance.now() - start
      console.debug("[perf] queue:add", elapsed.toFixed(1), "ms")
      return result
    }
    const elapsed = performance.now() - start
    console.debug("[perf] queue:add", elapsed.toFixed(1), "ms")
    return queue
  })
  ipcHandle(ipcChannels.queueAddMany, async (_event, input) => {
    const parsed = z
      .object({
        sourceUrls: z.array(nonEmptyString),
        playFromStart: z.boolean(),
      })
      .parse(input)
    if (parsed.sourceUrls.length === 0) {
      return deps.queue.list()
    }
    const urlMap = deps.library.findSourceUrlsForCanonicalUrls(parsed.sourceUrls)
    const mappedUrls = parsed.sourceUrls.map((url) => urlMap.get(url) ?? url)
    if (parsed.playFromStart) {
      await deps.player.stop()
      deps.queue.clear()
      emitQueue()
      const queue = deps.queue.addMany(mappedUrls)
      const first = queue[0]
      if (!first) {
        return emitQueue()
      }
      await playQueueItem(first.id)
      for (let i = 1; i < queue.length; i++) {
        const item = queue[i]
        resolveQueueItemInBackground({ id: item.id, sourceUrl: item.sourceUrl })
      }
      return emitQueue()
    }
    const queue = deps.queue.addMany(mappedUrls)
    for (const item of queue) {
      resolveQueueItemInBackground({ id: item.id, sourceUrl: item.sourceUrl })
    }
    return maybeStartFirstQueuedItem()
  })
  ipcHandle(ipcChannels.queueRemove, (_event, id) => {
    const queueItemId = nonEmptyString.parse(id)
    const currentQueueItemId = deps.player.getState().queueItemId
    const nextId = currentQueueItemId === queueItemId ? deps.queue.nextItemId(queueItemId) : null

    const removeAndEmit = () => {
      deps.queue.remove(queueItemId)
      return emitQueue()
    }

    if (currentQueueItemId !== queueItemId) {
      return removeAndEmit()
    }

    return deps.player.stop().then(async () => {
      removeAndEmit()
      if (nextId) {
        await playQueueItem(nextId)
      }
      return emitQueue()
    })
  })
  ipcHandle(ipcChannels.queueMove, (_event, id, sortOrder) => {
    deps.queue.move(nonEmptyString.parse(id), z.number().int().min(0).parse(sortOrder))
    return emitQueue()
  })
  ipcHandle(ipcChannels.queueShuffle, () => {
    const { queueItemId, status } = deps.player.getState()
    const anchorActive =
      queueItemId && (status === "playing" || status === "paused" || status === "loading")
    deps.queue.shuffle(anchorActive ? queueItemId : null)
    return emitQueue()
  })
  ipcHandle(ipcChannels.queueClear, async () => {
    await deps.player.stop()
    deps.queue.clear()
    return emitQueue()
  })

  void maybeStartFirstQueuedItem().catch((err) => {
    console.error("Failed to reconcile queued playback on startup", err)
  })

  ipcHandle(ipcChannels.playlistsList, () => {
    const start = performance.now()
    const result = deps.library.listPlaylists()
    const elapsed = performance.now() - start
    console.debug("[perf] playlists:list", elapsed.toFixed(1), "ms")
    return result
  })
  ipcHandle(ipcChannels.playlistsListMetadata, () => {
    const start = performance.now()
    const result = deps.library.listPlaylistsMetadata()
    const elapsed = performance.now() - start
    console.debug("[perf] playlists:list-metadata", elapsed.toFixed(1), "ms")
    return result
  })
  ipcHandle(ipcChannels.playlistsGetTracks, (_event, playlistId) => {
    const parsedId = nonEmptyString.parse(playlistId)
    const start = performance.now()
    const result = deps.library.getPlaylistTracks(parsedId)
    const elapsed = performance.now() - start
    console.debug("[perf] playlists:get-tracks", elapsed.toFixed(1), "ms")
    return result
  })
  ipcHandle(ipcChannels.playlistsCreate, (_event, name) =>
    deps.library.createPlaylist(nonEmptyString.parse(name))
  )
  ipcHandle(ipcChannels.playlistsRename, (_event, id, name) =>
    deps.library.renamePlaylist(nonEmptyString.parse(id), nonEmptyString.parse(name))
  )
  ipcHandle(ipcChannels.playlistsDelete, (_event, id) =>
    deps.library.deletePlaylist(nonEmptyString.parse(id))
  )
  ipcHandle(ipcChannels.playlistsAddTrack, async (_event, playlistId, sourceUrl) => {
    const validatedUrl = nonEmptyString.parse(sourceUrl)
    const validatedPlaylistId = nonEmptyString.parse(playlistId)
    const existing =
      deps.library.findTrackRowBySourceUrl(validatedUrl) ??
      deps.library.findTrackRowByCanonicalUrl(validatedUrl)
    if (existing) {
      const track = deps.library.getTrack(existing.id)
      if (track) return deps.library.addTrackToPlaylist(validatedPlaylistId, track.id, validatedUrl)
    }
    const resolved = await deps.resolver.resolve(validatedUrl)
    const track = deps.library.upsertTrack(resolved.candidate)
    return deps.library.addTrackToPlaylist(validatedPlaylistId, track.id, validatedUrl)
  })
  ipcHandle(ipcChannels.playlistsRemoveTrack, (_event, playlistId, entryId) =>
    deps.library.removeTrackFromPlaylist(
      nonEmptyString.parse(playlistId),
      nonEmptyString.parse(entryId)
    )
  )
  ipcHandle(ipcChannels.playlistsMoveTrack, (_event, playlistId, entryId, newIndex) =>
    deps.library.moveTrackInPlaylist(
      nonEmptyString.parse(playlistId),
      nonEmptyString.parse(entryId),
      z.number().int().min(0).parse(newIndex)
    )
  )

  ipcHandle(ipcChannels.tracksSetLiked, (_event, trackId, liked) =>
    deps.library.setTrackLiked(nonEmptyString.parse(trackId), z.boolean().parse(liked))
  )
  ipcHandle(ipcChannels.tracksSetCandidateLiked, (_event, candidate, liked) =>
    deps.library.setCandidateLiked(
      trackCandidateSchema.parse(candidate) as TrackCandidate,
      z.boolean().parse(liked)
    )
  )

  ipcHandle(ipcChannels.downloadsDownloadTrack, (_event, trackId) => {
    const parsedId = nonEmptyString.parse(trackId)
    const start = performance.now()
    const result = deps.downloads.downloadTrack(parsedId)
    const elapsed = performance.now() - start
    console.debug("[perf] downloads:download-track", elapsed.toFixed(1), "ms")
    return result
  })
  ipcHandle(ipcChannels.downloadsDownloadCandidate, (_event, candidate) =>
    deps.downloads.downloadCandidate(trackCandidateSchema.parse(candidate) as TrackCandidate)
  )
  ipcHandle(ipcChannels.downloadsDownloadPlaylist, (_event, playlistId) =>
    deps.downloads.downloadPlaylist(nonEmptyString.parse(playlistId))
  )
  ipcHandle(ipcChannels.downloadsRemoveTrack, (_event, trackId) =>
    deps.downloads.removeTrackDownload(nonEmptyString.parse(trackId))
  )

  ipcHandle(ipcChannels.importsStart, (_event, input) => {
    const parsed = z
      .object({ url: nonEmptyString, targetPlaylistId: z.string().nullable() })
      .parse(input)
    return deps.imports.start(parsed.url, parsed.targetPlaylistId)
  })
  ipcHandle(ipcChannels.importsGetStatus, (_event, id) =>
    deps.imports.getStatus(nonEmptyString.parse(id))
  )

  ipcHandle(ipcChannels.lyricsGetForTrack, (_event, track) =>
    deps.lyrics.getForTrack(playerTrackSchema.parse(track) as PlayerTrack)
  )

  ipcHandle(ipcChannels.settingsGet, () => deps.settings.get())
  ipcHandle(ipcChannels.settingsGetVersion, () => app.getVersion())
  ipcHandle(ipcChannels.settingsGetUpdateStatus, () => deps.updater.getStatus())
  ipcHandle(ipcChannels.settingsCheckForUpdates, () => deps.updater.checkForUpdates())
  ipcHandle(ipcChannels.settingsDownloadUpdate, () => deps.updater.downloadUpdate())
  ipcHandle(ipcChannels.settingsInstallUpdate, () => {
    deps.updater.installUpdate()
  })
  ipcHandle(ipcChannels.settingsUpdate, (_event, patch) => {
    const parsed = z
      .object({
        mpvPath: z.string().optional(),
        ytdlpPath: z.string().optional(),
        playbackVolume: z.number().int().min(0).max(100).optional(),
        resolverTimeoutMs: z.number().int().positive().optional(),
        cacheTtlHours: z.number().int().positive().optional(),
        streamCacheTtlMinutes: z.number().int().positive().optional(),
        importMaxTracks: z.number().int().min(1).max(500).optional(),
        importMatchConcurrency: z.number().int().min(1).max(16).optional(),
        spotifyMatchScoreThreshold: z.number().min(0).max(1).optional(),
        deezerMatchThreshold: z.number().min(0).max(1).optional(),
        importProgressThrottle: z.number().int().min(1).max(100).optional(),
        discordPresenceEnabled: z.boolean().optional(),
        recommendationsEnabled: z.boolean().optional(),
        recommendationsRolloutPercent: z.number().int().min(0).max(100).optional(),
      })
      .parse(patch)
    const updated = deps.settings.update(parsed)
    deps.presence.setEnabled(updated.discordPresenceEnabled)
    deps.presence.sync(deps.player.getState())
    return updated
  })

  ipcHandle(ipcChannels.recommendationsIsEnabled, () => deps.recommendations.isEnabled())
  ipcHandle(ipcChannels.recommendationsGetHome, (_event, limit) =>
    deps.recommendations.getHomeRecommendations(
      z.number().int().min(1).max(48).optional().parse(limit)
    )
  )
  ipcHandle(ipcChannels.recommendationsTrackImpression, (_event, input) => {
    const parsed = z
      .object({
        sessionId: nonEmptyString,
        trackId: nonEmptyString,
        position: z.number().int().min(0),
      })
      .parse(input)
    deps.recommendations.trackImpression(parsed.sessionId, parsed.trackId, parsed.position)
  })
  ipcHandle(ipcChannels.recommendationsTrackInteraction, (_event, input) => {
    const parsed = z
      .object({
        sessionId: nonEmptyString,
        trackId: nonEmptyString,
        type: z.enum(["play", "skip", "like", "save", "dismiss"]),
        metadata: z.string().optional(),
      })
      .parse(input)
    deps.recommendations.trackInteraction(
      parsed.sessionId,
      parsed.trackId,
      parsed.type,
      parsed.metadata
    )
  })
  ipcHandle(ipcChannels.recommendationsGetMetrics, () => deps.recommendations.getMetrics())

  cleanupPreviousHandlers = () => {
    deps.window.off("maximize", onWindowMaximize)
    deps.window.off("unmaximize", onWindowUnmaximize)
  }
}
