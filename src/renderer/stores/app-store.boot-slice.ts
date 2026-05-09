import type { AppStoreSlice } from "./app-store.types"
import {
  deriveQueueNavigation,
  patchTrackInPlaylists,
  patchTrackInQueue,
  setQueue,
} from "./app-store.utils"

export const createBootSlice: AppStoreSlice = (set, get) => ({
  loadInitialData: async () => {
    set({ bootPhase: "loading", bootError: null })
    try {
      const [initialPlayer, initialPlaylists, initialQueue] = await Promise.all([
        window.loopify.player.getState(),
        window.loopify.playlists.list(),
        window.loopify.queue.list(),
      ])
      const recommendationsEnabled = await window.loopify.recommendations.isEnabled()
      const [homeRecommendations, recommendationMetrics] = recommendationsEnabled
        ? await Promise.all([
            window.loopify.recommendations.getHome(12),
            window.loopify.recommendations.getMetrics(),
          ])
        : [null, null]
      set({
        playerState: initialPlayer,
        playerPosition: {
          positionSeconds: initialPlayer.positionSeconds,
          durationSeconds: initialPlayer.durationSeconds,
          bufferedDuration: 0,
        },
        lastPlayerState: initialPlayer,
        playlists: initialPlaylists,
        queue: initialQueue,
        ...deriveQueueNavigation(initialQueue, initialPlayer?.queueItemId),
        queueMap: new Map(initialQueue.map((item) => [item.id, item])),
        recommendationsEnabled,
        homeRecommendations,
        recommendationMetrics,
        bootPhase: "ready",
      })
    } catch (error) {
      console.error("Failed to load initial data", error)
      set({
        bootPhase: "error",
        bootError:
          error instanceof Error
            ? error.message
            : "Could not connect to the player or library. Retry or restart the app.",
      })
    }
  },

  initSubscriptions: () => {
    let lastPlayerMetadataJson = ""
    const unsubPlayer = window.loopify.player.onStateChange((newState) => {
      const { positionSeconds: _pos, durationSeconds: _dur, ...metaOnly } = newState
      const metaJson = JSON.stringify(metaOnly)
      if (metaJson === lastPlayerMetadataJson) {
        return
      }
      lastPlayerMetadataJson = metaJson

      const previousState = get().lastPlayerState
      const shouldRefreshCollections =
        !previousState ||
        previousState.queueItemId !== newState.queueItemId ||
        previousState.status !== newState.status ||
        previousState.title !== newState.title
      set({
        playerState: newState,
        lastPlayerState: newState,
        playerPosition: {
          positionSeconds: newState.positionSeconds,
          durationSeconds: newState.durationSeconds,
          bufferedDuration: 0,
        },
        ...deriveQueueNavigation(get().queue, newState.queueItemId),
      })
      if (shouldRefreshCollections) {
        get().refreshQueue().catch(console.error)
      }
    })

    const unsubPosition = window.loopify.player.onPositionChange((position) => {
      set({ playerPosition: position })
    })

    const unsubQueue = window.loopify.queue.onChange((nextQueue) => {
      const { playerState } = get()
      set({
        ...setQueue(nextQueue, playerState?.queueItemId),
      })
    })

    const unsubSettings = window.loopify.settings.onUpdateStatusChange((status) => {
      set({ updateStatus: status })
    })
    window.loopify.settings
      .getUpdateStatus()
      .then((status) => set({ updateStatus: status }))
      .catch(console.error)

    const unsubDownloads = window.loopify.downloads.onChange((track) => {
      set((state) => {
        const nextQueue = patchTrackInQueue(state.queue, track)
        return {
          ...setQueue(nextQueue, state.playerState?.queueItemId),
          playlists: patchTrackInPlaylists(state.playlists, track),
        }
      })
    })

    return () => {
      unsubPlayer()
      unsubPosition()
      unsubQueue()
      unsubSettings()
      unsubDownloads()
    }
  },
})
