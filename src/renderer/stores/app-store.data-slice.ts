import type { AppStoreSlice } from "./app-store.types"
import { deriveQueueNavigation, mergeFreshPlaylists } from "./app-store.utils"

export const createDataSlice: AppStoreSlice = (set, get) => ({
  refreshQueue: async () => {
    const updated = await window.loopify.queue.list()
    const { playerState } = get()
    set({
      queue: updated,
      ...deriveQueueNavigation(updated, playerState?.queueItemId),
      queueMap: new Map(updated.map((item) => [item.id, item])),
    })
    return updated
  },

  refreshPlaylists: async () => {
    const updated = await window.loopify.playlists.list()
    set((state) => ({
      playlists: mergeFreshPlaylists(state.playlists, updated),
    }))
    return updated
  },

  refreshPlaylistsMetadata: async () => {
    const metadata = await window.loopify.playlists.listMetadata()
    set((state) => ({
      playlists: metadata.map((meta) => {
        const existing = state.playlists.find((p) => p.id === meta.id)
        if (existing) {
          return {
            ...meta,
            tracks: existing.tracks,
            totalDurationMs: meta.totalDurationMs,
            trackCount: meta.trackCount ?? existing.trackCount,
          }
        }
        return meta
      }),
    }))
    return metadata
  },

  refreshRecommendations: async () => {
    const { recommendationsEnabled } = get()
    if (!recommendationsEnabled) return
    const [homeRecommendations, recommendationMetrics] = await Promise.all([
      window.loopify.recommendations.getHome(12),
      window.loopify.recommendations.getMetrics(),
    ])
    set({ homeRecommendations, recommendationMetrics })
  },

  setDiscoverRecommendationContext: (sessionId, trackIds) => {
    set({
      discoverRecommendationSessionId: sessionId,
      discoverRecommendationTrackIds: sessionId ? new Set(trackIds ?? []) : new Set(),
    })
  },

  trackRecommendationInteraction: async (trackId, type, metadata, options) => {
    const { discoverRecommendationSessionId, discoverRecommendationTrackIds, homeRecommendations } =
      get()
    const sessionId =
      options?.sessionId ??
      (discoverRecommendationSessionId && discoverRecommendationTrackIds.has(trackId)
        ? discoverRecommendationSessionId
        : homeRecommendations?.sessionId)
    if (!sessionId) return
    await window.loopify.recommendations.trackInteraction({ sessionId, trackId, type, metadata })
    await get().refreshRecommendations()
  },
})
