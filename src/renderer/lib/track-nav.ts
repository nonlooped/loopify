import type { CatalogTrack, Track } from "src/shared/types/music"
import { useAppStore } from "@/stores/app.store"

export async function navigateFromTrack(track: Track | CatalogTrack) {
  const setLibraryView = useAppStore.getState().setLibraryView

  // CatalogTrack has deezer IDs embedded
  if ("catalogId" in track) {
    if (track.albumDeezerId != null) {
      setLibraryView({ kind: "album", deezerId: track.albumDeezerId })
      return
    }
    if (track.artistDeezerId != null) {
      setLibraryView({ kind: "artist", deezerId: track.artistDeezerId })
      return
    }
    return
  }

  // Track (library/queue) needs lookup
  const navInfo = await window.loopify.catalog.getTrackNavInfo(track.id)
  if (navInfo?.albumDeezerId != null) {
    setLibraryView({ kind: "album", deezerId: navInfo.albumDeezerId })
    return
  }
  if (navInfo?.artistDeezerId != null) {
    setLibraryView({ kind: "artist", deezerId: navInfo.artistDeezerId })
    return
  }
}

export async function navigateFromArtist(track: Track | CatalogTrack) {
  const setLibraryView = useAppStore.getState().setLibraryView

  if ("catalogId" in track) {
    if (track.artistDeezerId != null) {
      setLibraryView({ kind: "artist", deezerId: track.artistDeezerId })
    }
    return
  }

  const navInfo = await window.loopify.catalog.getTrackNavInfo(track.id)
  if (navInfo?.artistDeezerId != null) {
    setLibraryView({ kind: "artist", deezerId: navInfo.artistDeezerId })
  }
}
