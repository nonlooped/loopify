import { existsSync } from "node:fs"
import { app, type BrowserWindow, ipcMain } from "electron"
import { z } from "zod"
import { ipcChannels } from "../../shared/contracts/ipc"
import type {
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
}

const nonEmptyString = z.string().trim().min(1)
const nullableNonEmptyString = z.string().trim().min(1).nullable()
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
  durationMs: z.number().int().nonnegative().nullable(),
  thumbnailUrl: z.string().nullable(),
  sourceUrl: nonEmptyString,
  canonicalUrl: nonEmptyString,
  provider: providerSchema,
  sourceId: z.string().nullable(),
  extractor: z.string().nullable(),
})

export function registerIpcHandlers(deps: HandlerDeps): void {
  const emitQueue = (): QueueItem[] => {
    const queue = deps.queue.list()
    deps.window.webContents.send(ipcChannels.queueChanged, queue)
    return queue
  }

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

  const playQueueItem = async (queueItemId: string) => {
    const item = deps.queue.get(nonEmptyString.parse(queueItemId))
    if (!item) throw new Error("Queue item was not found.")

    const downloadedPath = item.track ? getDownloadedPlaybackPath(item.track) : null
    if (item.track && downloadedPath) {
      deps.queue.clearPlaying()
      deps.queue.setTrack(item.id, item.track.id, "playing")
      emitQueue()
      return deps.player.play(downloadedPath, item.id, item.track)
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
      return deps.player.play(playbackPath, item.id, track)
    } catch (error) {
      deps.queue.setStatus(item.id, "failed")
      emitQueue()
      throw error
    }
  }

  deps.player.on("state", (state) => {
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
    deps.window.webContents.send(ipcChannels.playerStateChanged, deps.player.getState())
  })

  ipcMain.handle(ipcChannels.playerGetState, () => deps.player.getState())
  ipcMain.handle(ipcChannels.playerPause, () => deps.player.pause())
  ipcMain.handle(ipcChannels.playerResume, () => deps.player.resume())
  ipcMain.handle(ipcChannels.playerStop, async () => {
    const state = deps.player.getState()
    if (!state.queueItemId) {
      return deps.player.stop()
    }

    if (state.status === "playing") {
      await deps.player.pause()
    }

    return deps.player.seek(0)
  })
  ipcMain.handle(ipcChannels.playerSeek, (_event, seconds) =>
    deps.player.seek(z.number().min(0).parse(seconds))
  )
  ipcMain.handle(ipcChannels.playerSetVolume, (_event, volume) =>
    deps.player.setVolume(z.number().min(0).max(100).parse(volume))
  )
  ipcMain.handle(ipcChannels.playerSetRepeatMode, (_event, mode) =>
    deps.player.setRepeatMode(repeatModeSchema.parse(mode) as RepeatMode)
  )
  ipcMain.handle(ipcChannels.playerPlay, (_event, queueItemId) => playQueueItem(queueItemId))

  ipcMain.handle(ipcChannels.searchQuery, (_event, input) => {
    const parsed = z
      .object({ text: nonEmptyString, providers: z.array(z.string()).optional() })
      .parse(input)
    return deps.resolver.search(parsed.text)
  })
  ipcMain.handle(ipcChannels.resolverResolve, (_event, input) =>
    deps.resolver.resolve(nonEmptyString.parse(input))
  )

  ipcMain.handle(ipcChannels.queueList, () => deps.queue.list())
  ipcMain.handle(ipcChannels.queueAdd, async (_event, input) => {
    const parsed = z
      .object({ sourceUrl: nonEmptyString, playNow: z.boolean().optional() })
      .parse(input)
    if (parsed.playNow) {
      await deps.player.stop()
      deps.queue.clear()
      emitQueue()
    }
    const queue = deps.queue.add(parsed.sourceUrl)
    const item = queue[queue.length - 1]
    if (parsed.playNow && item) {
      await playQueueItem(item.id)
      return emitQueue()
    }
    if (item) {
      resolveQueueItemInBackground({ id: item.id, sourceUrl: item.sourceUrl })
      return maybeStartFirstQueuedItem()
    }
    return queue
  })
  ipcMain.handle(ipcChannels.queueAddMany, async (_event, input) => {
    const parsed = z
      .object({
        sourceUrls: z.array(nonEmptyString),
        playFromStart: z.boolean(),
      })
      .parse(input)
    if (parsed.sourceUrls.length === 0) {
      return deps.queue.list()
    }
    if (parsed.playFromStart) {
      await deps.player.stop()
      deps.queue.clear()
      emitQueue()
      for (const sourceUrl of parsed.sourceUrls) {
        deps.queue.add(sourceUrl)
      }
      const list = deps.queue.list()
      const first = list[0]
      if (!first) {
        return emitQueue()
      }
      await playQueueItem(first.id)
      for (let i = 1; i < list.length; i++) {
        const item = list[i]
        resolveQueueItemInBackground({ id: item.id, sourceUrl: item.sourceUrl })
      }
      return emitQueue()
    }
    for (const sourceUrl of parsed.sourceUrls) {
      deps.queue.add(sourceUrl)
      const list = deps.queue.list()
      const last = list[list.length - 1]
      if (last) {
        resolveQueueItemInBackground({ id: last.id, sourceUrl: last.sourceUrl })
      }
    }
    return maybeStartFirstQueuedItem()
  })
  ipcMain.handle(ipcChannels.queueRemove, (_event, id) => {
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
  ipcMain.handle(ipcChannels.queueMove, (_event, id, sortOrder) => {
    deps.queue.move(nonEmptyString.parse(id), z.number().int().min(0).parse(sortOrder))
    return emitQueue()
  })
  ipcMain.handle(ipcChannels.queueShuffle, () => {
    const { queueItemId, status } = deps.player.getState()
    const anchorActive =
      queueItemId && (status === "playing" || status === "paused" || status === "loading")
    deps.queue.shuffle(anchorActive ? queueItemId : null)
    return emitQueue()
  })
  ipcMain.handle(ipcChannels.queueClear, async () => {
    await deps.player.stop()
    deps.queue.clear()
    return emitQueue()
  })

  void maybeStartFirstQueuedItem().catch((err) => {
    console.error("Failed to reconcile queued playback on startup", err)
  })

  ipcMain.handle(ipcChannels.playlistsList, () => deps.library.listPlaylists())
  ipcMain.handle(ipcChannels.playlistsCreate, (_event, name) =>
    deps.library.createPlaylist(nonEmptyString.parse(name))
  )
  ipcMain.handle(ipcChannels.playlistsRename, (_event, id, name) =>
    deps.library.renamePlaylist(nonEmptyString.parse(id), nonEmptyString.parse(name))
  )
  ipcMain.handle(ipcChannels.playlistsDelete, (_event, id) =>
    deps.library.deletePlaylist(nonEmptyString.parse(id))
  )
  ipcMain.handle(ipcChannels.playlistsAddTrack, async (_event, playlistId, sourceUrl) => {
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
  ipcMain.handle(ipcChannels.playlistsRemoveTrack, (_event, playlistId, entryId) =>
    deps.library.removeTrackFromPlaylist(
      nonEmptyString.parse(playlistId),
      nonEmptyString.parse(entryId)
    )
  )
  ipcMain.handle(ipcChannels.playlistsMoveTrack, (_event, playlistId, entryId, newIndex) =>
    deps.library.moveTrackInPlaylist(
      nonEmptyString.parse(playlistId),
      nonEmptyString.parse(entryId),
      z.number().int().min(0).parse(newIndex)
    )
  )

  ipcMain.handle(ipcChannels.tracksSetLiked, (_event, trackId, liked) =>
    deps.library.setTrackLiked(nonEmptyString.parse(trackId), z.boolean().parse(liked))
  )
  ipcMain.handle(ipcChannels.tracksSetCandidateLiked, (_event, candidate, liked) =>
    deps.library.setCandidateLiked(
      trackCandidateSchema.parse(candidate) as TrackCandidate,
      z.boolean().parse(liked)
    )
  )

  ipcMain.handle(ipcChannels.downloadsDownloadTrack, (_event, trackId) =>
    deps.downloads.downloadTrack(nonEmptyString.parse(trackId))
  )
  ipcMain.handle(ipcChannels.downloadsDownloadCandidate, (_event, candidate) =>
    deps.downloads.downloadCandidate(trackCandidateSchema.parse(candidate) as TrackCandidate)
  )
  ipcMain.handle(ipcChannels.downloadsDownloadPlaylist, (_event, playlistId) =>
    deps.downloads.downloadPlaylist(nonEmptyString.parse(playlistId))
  )
  ipcMain.handle(ipcChannels.downloadsRemoveTrack, (_event, trackId) =>
    deps.downloads.removeTrackDownload(nonEmptyString.parse(trackId))
  )

  ipcMain.handle(ipcChannels.importsStart, (_event, input) => {
    const parsed = z
      .object({ url: nonEmptyString, targetPlaylistId: z.string().nullable() })
      .parse(input)
    return deps.imports.start(parsed.url, parsed.targetPlaylistId)
  })
  ipcMain.handle(ipcChannels.importsGetStatus, (_event, id) =>
    deps.imports.getStatus(nonEmptyString.parse(id))
  )

  ipcMain.handle(ipcChannels.lyricsGetForTrack, (_event, track) =>
    deps.lyrics.getForTrack(playerTrackSchema.parse(track) as PlayerTrack)
  )

  ipcMain.handle(ipcChannels.settingsGet, () => deps.settings.get())
  ipcMain.handle(ipcChannels.settingsGetVersion, () => app.getVersion())
  ipcMain.handle(ipcChannels.settingsGetUpdateStatus, () => deps.updater.getStatus())
  ipcMain.handle(ipcChannels.settingsCheckForUpdates, () => deps.updater.checkForUpdates())
  ipcMain.handle(ipcChannels.settingsDownloadUpdate, () => deps.updater.downloadUpdate())
  ipcMain.handle(ipcChannels.settingsInstallUpdate, () => {
    deps.updater.installUpdate()
  })
  ipcMain.handle(ipcChannels.settingsUpdate, (_event, patch) => {
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
        metadataEnrichmentEnabled: z.boolean().optional(),
        metadataMinScore: z.number().min(0).max(1).optional(),
        importProgressThrottle: z.number().int().min(1).max(100).optional(),
        discordPresenceEnabled: z.boolean().optional(),
        communityLyricsFallbackEnabled: z.boolean().optional(),
      })
      .parse(patch)
    const updated = deps.settings.update(parsed)
    deps.presence.setEnabled(updated.discordPresenceEnabled)
    deps.presence.sync(deps.player.getState())
    return updated
  })
}
