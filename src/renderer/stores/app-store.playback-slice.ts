import type { PlayerState } from "src/shared/types/music"
import { NEAR_END_OFFSET_SEC } from "../lib/keyboard-shortcuts"
import type { AppStoreSlice } from "./app-store.types"
import {
  deriveQueueNavigation,
  formatActionError,
  nextRepeatMode,
  setQueue,
} from "./app-store.utils"
import { shuffleArray } from "./shuffle"

export const createPlaybackSlice: AppStoreSlice = (set, get) => ({
  handlePlayPause: async () => {
    try {
      const { playerState } = get()
      let nextState: PlayerState | null = null
      if (playerState?.status === "playing") {
        nextState = await window.loopify.player.pause()
      } else if (playerState?.status === "paused") {
        nextState = await window.loopify.player.resume()
      } else if (playerState?.queueItemId) {
        nextState = await window.loopify.player.play(playerState.queueItemId)
      }
      if (nextState) {
        const queue = get().queue
        set({
          playerState: nextState,
          lastPlayerState: nextState,
          ...deriveQueueNavigation(queue, nextState.queueItemId),
        })
      }
      await Promise.all([get().refreshQueue(), get().refreshPlaylists()])
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Playback could not be changed.") })
    }
  },

  handleCycleRepeat: async () => {
    try {
      const { lastPlayerState, playerState } = get()
      const currentMode = lastPlayerState?.repeatMode ?? playerState?.repeatMode ?? "off"
      const nextState = await window.loopify.player.setRepeatMode(nextRepeatMode(currentMode))
      const queue = get().queue
      set({
        playerState: nextState,
        lastPlayerState: nextState,
        ...deriveQueueNavigation(queue, nextState.queueItemId),
      })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not change repeat mode.") })
    }
  },

  handleNext: async () => {
    const { queue, currentTrackIndex } = get()
    if (currentTrackIndex < 0 || currentTrackIndex >= queue.length - 1) return
    try {
      const nextState = await window.loopify.player.play(queue[currentTrackIndex + 1].id)
      set({ playerState: nextState, lastPlayerState: nextState })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not go to the next track.") })
    }
  },

  handlePrevious: async () => {
    const { queue, currentTrackIndex } = get()
    if (currentTrackIndex <= 0) return
    try {
      const nextState = await window.loopify.player.play(queue[currentTrackIndex - 1].id)
      set({ playerState: nextState, lastPlayerState: nextState })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not go to the previous track.") })
    }
  },

  handleStop: async () => {
    try {
      const st = await window.loopify.player.stop()
      set({ playerState: st, lastPlayerState: st })
      await get().refreshQueue()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not stop playback.") })
    }
  },

  handleSeek: async (s) => {
    try {
      set({ playerState: await window.loopify.player.seek(s) })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not seek in the current track.") })
    }
  },

  handleSeekRelative: async (delta) => {
    const s = get().lastPlayerState
    if (!s?.queueItemId) return
    const pos = s.positionSeconds
    const d = s.durationSeconds
    const next = d != null ? Math.max(0, Math.min(d, pos + delta)) : Math.max(0, pos + delta)
    try {
      const st = await window.loopify.player.seek(next)
      set({ playerState: st, lastPlayerState: st })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not seek in the current track.") })
    }
  },

  handleSeekToStart: async () => {
    const s = get().lastPlayerState
    if (!s?.queueItemId) return
    try {
      const st = await window.loopify.player.seek(0)
      set({ playerState: st, lastPlayerState: st })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not seek in the current track.") })
    }
  },

  handleSeekNearEnd: async () => {
    const s = get().lastPlayerState
    if (!s?.queueItemId) return
    const d = s.durationSeconds
    if (d == null || d <= 0) return
    const target = Math.max(0, d - NEAR_END_OFFSET_SEC)
    try {
      const st = await window.loopify.player.seek(target)
      set({ playerState: st, lastPlayerState: st })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not seek in the current track.") })
    }
  },

  handleVolumeChange: async (v) => {
    try {
      set({ playerState: await window.loopify.player.setVolume(v) })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not change volume.") })
    }
  },

  handleVolumeDelta: async (delta) => {
    const s = get().lastPlayerState
    if (!s) return
    const v = Math.max(0, Math.min(100, (s.volume ?? 75) + delta))
    try {
      const st = await window.loopify.player.setVolume(v)
      set({ playerState: st, lastPlayerState: st })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not change volume.") })
    }
  },

  handlePlayTrack: async (track) => {
    try {
      if ("id" in track) {
        await get().trackRecommendationInteraction(track.id, "play")
      }
      const sourceUrl = "sourceUrl" in track ? track.sourceUrl : track.canonicalUrl
      const updatedQueue = await window.loopify.queue.add({ sourceUrl, playNow: true })
      set(setQueue(updatedQueue, get().playerState?.queueItemId))
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not start playback for that track.") })
    }
  },

  handleEnqueueTrack: async (track) => {
    try {
      const updatedQueue = await window.loopify.queue.add({
        sourceUrl: track.sourceUrl,
        playNow: false,
      })
      set(setQueue(updatedQueue, get().playerState?.queueItemId))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that track to the queue.") })
    }
  },

  handleEnqueuePlaylistTrack: async (track) => {
    try {
      const updatedQueue = await window.loopify.queue.add({
        sourceUrl: track.canonicalUrl,
        playNow: false,
      })
      set(setQueue(updatedQueue, get().playerState?.queueItemId))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that track to the queue.") })
    }
  },

  handlePlayPlaylist: async (playlist) => {
    try {
      const tracks =
        playlist.tracks && playlist.tracks.length > 0
          ? playlist.tracks
          : await window.loopify.playlists.getTracks(playlist.id)
      if (tracks.length === 0) return
      let sourceUrls = tracks.map((t) => t.canonicalUrl)
      const { playlistShuffleIds } = get()
      if (playlistShuffleIds.has(playlist.id)) {
        sourceUrls = shuffleArray(sourceUrls)
      }
      const next = await window.loopify.queue.addMany({ sourceUrls, playFromStart: true })
      set(setQueue(next, get().playerState?.queueItemId))
      await get().refreshPlaylists()
    } catch (err) {
      console.error("Failed to play playlist:", err)
      set({ actionError: formatActionError(err, "Could not play that playlist.") })
    }
  },

  handleEnqueuePlaylist: async (playlist) => {
    try {
      const tracks =
        playlist.tracks && playlist.tracks.length > 0
          ? playlist.tracks
          : await window.loopify.playlists.getTracks(playlist.id)
      if (tracks.length === 0) return
      const sourceUrls = tracks.map((t) => t.canonicalUrl)
      const next = await window.loopify.queue.addMany({ sourceUrls, playFromStart: false })
      set(setQueue(next, get().playerState?.queueItemId))
    } catch (err) {
      console.error("Failed to enqueue playlist:", err)
      set({ actionError: formatActionError(err, "Could not add that playlist to the queue.") })
    }
  },

  handleShuffleQueue: async () => {
    const { queue } = get()
    if (queue.length < 2) return
    try {
      const nextQ = await window.loopify.queue.shuffle()
      set(setQueue(nextQ, get().playerState?.queueItemId))
    } catch (err) {
      console.error("Failed to shuffle queue:", err)
      set({ actionError: formatActionError(err, "Could not shuffle the queue.") })
    }
  },

  togglePlaylistShuffle: (id) => {
    const { playlistShuffleIds } = get()
    const next = new Set(playlistShuffleIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    set({ playlistShuffleIds: next })
  },

  queueOnPlay: async (item) => {
    try {
      const nextState = await window.loopify.player.play(item.id)
      const queue = get().queue
      set({
        playerState: nextState,
        lastPlayerState: nextState,
        ...setQueue(queue, nextState.queueItemId),
      })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not play that queue item.") })
    }
  },

  queueOnRemove: async (id) => {
    try {
      const nextQ = await window.loopify.queue.remove(id)
      set(setQueue(nextQ, get().playerState?.queueItemId))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not remove that item from the queue.") })
    }
  },

  queueOnClear: async () => {
    try {
      const nextQ = await window.loopify.queue.clear()
      set(setQueue(nextQ, get().playerState?.queueItemId))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not clear the queue.") })
    }
  },

  queueOnReorder: async (id, newIndex) => {
    try {
      const nextQ = await window.loopify.queue.move(id, newIndex)
      set(setQueue(nextQ, get().playerState?.queueItemId))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not reorder the queue.") })
    }
  },
})
