import type { AppStoreSlice } from "./app-store.types"
import {
  formatActionError,
  patchTrackEverywhere,
  patchTrackInQueue,
  setQueue,
} from "./app-store.utils"

export const createPlaylistsSlice: AppStoreSlice = (set, get) => ({
  handleCreatePlaylist: () => {
    set({ playlistAction: { kind: "create" } })
  },

  openRenamePlaylist: (p) => {
    set({ playlistAction: { kind: "rename", id: p.id, currentName: p.name } })
  },

  openDeletePlaylist: (p) => {
    set({ playlistAction: { kind: "delete", id: p.id, name: p.name } })
  },

  submitPlaylistCreate: async (name) => {
    await window.loopify.playlists.create(name)
    const metadata = await get().refreshPlaylistsMetadata()
    const lastPlaylist = metadata[metadata.length - 1]
    if (lastPlaylist) {
      set({ libraryView: { kind: "playlist", id: lastPlaylist.id } })
    }
  },

  submitPlaylistRename: async (id, name) => {
    await window.loopify.playlists.rename(id, name)
    await get().refreshPlaylistsMetadata()
  },

  submitPlaylistDelete: async (id) => {
    const { libraryView } = get()
    const isViewingDeletedPlaylist = libraryView.kind === "playlist" && libraryView.id === id
    await window.loopify.playlists.delete(id)
    await get().refreshPlaylistsMetadata()
    if (isViewingDeletedPlaylist) {
      set({ libraryView: { kind: "collection" } })
    }
  },

  handleRemoveFromPlaylist: async (playlistId, entryId) => {
    try {
      const updated = await window.loopify.playlists.removeTrack(playlistId, entryId)
      set({ playlists: updated })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not remove that track from the playlist.") })
    }
  },

  handleMovePlaylistTrack: async (playlistId, entryId, newIndex) => {
    try {
      const updated = await window.loopify.playlists.moveTrack(playlistId, entryId, newIndex)
      set({ playlists: updated })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not reorder that track.") })
    }
  },

  handleToggleLikeTrack: async (track) => {
    try {
      const updatedTrack = await window.loopify.tracks.setLiked(track.id, !track.likedAt)
      if (!track.likedAt) {
        await get().trackRecommendationInteraction(track.id, "like")
        await get().trackRecommendationInteraction(track.id, "save")
      }
      set((state) => {
        const nextQueue = patchTrackInQueue(state.queue, updatedTrack)
        return setQueue(nextQueue, state.playerState?.queueItemId)
      })
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not update liked songs.") })
    }
  },

  handleLikeCandidate: async (track) => {
    try {
      const updatedTrack = await window.loopify.tracks.setCandidateLiked(track, true)
      set((state) => {
        const nextQueue = patchTrackInQueue(state.queue, updatedTrack)
        return setQueue(nextQueue, state.playerState?.queueItemId)
      })
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that song to Liked Songs.") })
    }
  },

  handleAddTrackToPlaylist: async (playlistId, track) => {
    try {
      const updated = await window.loopify.playlists.addTrack(playlistId, track.canonicalUrl)
      set({ playlists: updated })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that track to the playlist.") })
    }
  },

  handleDownloadTrack: async (track) => {
    try {
      const updatedTrack = await window.loopify.downloads.downloadTrack(track.id)
      set((state) => patchTrackEverywhere(state, updatedTrack))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not start that download.") })
    }
  },

  handleDownloadCandidate: async (track) => {
    try {
      const updatedTrack = await window.loopify.downloads.downloadCandidate(track)
      set((state) => {
        const nextQueue = patchTrackInQueue(state.queue, updatedTrack)
        return setQueue(nextQueue, state.playerState?.queueItemId)
      })
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not start that download.") })
    }
  },

  handleRemoveTrackDownload: async (track) => {
    try {
      const updatedTrack = await window.loopify.downloads.removeTrackDownload(track.id)
      set((state) => patchTrackEverywhere(state, updatedTrack))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not remove that local file.") })
    }
  },

  handleDownloadPlaylist: async (playlist) => {
    try {
      const updated = await window.loopify.downloads.downloadPlaylist(playlist.id)
      set({ playlists: updated })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not start playlist downloads.") })
    }
  },
})
