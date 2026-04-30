import {
  Copy,
  Download,
  Heart,
  ListMusic,
  ListPlus,
  Pencil,
  Play,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react"
import {
  isSystemPlaylistId,
  LIKED_SONGS_PLAYLIST_ID,
  type Playlist,
  type Track,
} from "src/shared/types/music"
import { useAppStore } from "@/stores/app.store"
import type { ContextMenuItem } from "@/stores/context-menu.store"

/* ---------------------------------------------------------------------------
 * Track context menu
 * Used for: playlist track rows, queue items, now-playing artwork
 * ----------------------------------------------------------------------- */

export interface TrackContextMenuOptions {
  /** The track this menu is for. */
  track: Track
  /** If inside a playlist, its id (to skip in "Add to Playlist"). */
  currentPlaylistId?: string
  /** Show "Remove from Playlist"? Only for non-system playlists. */
  showRemoveFromPlaylist?: { playlistId: string; entryId: string }
  /** Show "Remove from Queue"? */
  showRemoveFromQueue?: { queueItemId: string }
  /** Show "Move to Top / Bottom" queue actions? */
  showQueueMoveActions?: boolean
  /** Show queue move count (total). */
  queueItemCount?: number
  /** Additional items to prepend. */
  extras?: ContextMenuItem[]
}

export function buildTrackContextMenu(opts: TrackContextMenuOptions): ContextMenuItem[] {
  const store = useAppStore.getState()
  const {
    track,
    currentPlaylistId,
    showRemoveFromPlaylist,
    showRemoveFromQueue,
    showQueueMoveActions,
    queueItemCount,
    extras,
  } = opts
  const isLiked = Boolean(track.likedAt)
  const isDownloaded = track.downloadStatus === "downloaded"
  const isDownloadBusy = track.downloadStatus === "queued" || track.downloadStatus === "downloading"

  const items: ContextMenuItem[] = []

  if (extras) items.push(...extras)

  /* Play / Enqueue */
  items.push({
    type: "item",
    label: "Play",
    icon: <Play className="h-4 w-4" />,
    onSelect: () => store.handlePlayTrack(track),
  })

  items.push({
    type: "item",
    label: "Add to Queue",
    icon: <ListPlus className="h-4 w-4" />,
    shortcut: "Q",
    onSelect: () => store.handleEnqueuePlaylistTrack(track),
  })

  /* Queue repositioning */
  if (showQueueMoveActions && queueItemCount != null) {
    items.push(
      {
        type: "item",
        label: "Move to Top",
        icon: <ListMusic className="h-4 w-4" />,
        onSelect: () => {
          const item = store.queue.find((q) => q.track?.id === track.id)
          if (item) store.queueOnReorder(item.id, 0)
        },
      },
      {
        type: "item",
        label: "Move to Bottom",
        icon: <ListMusic className="h-4 w-4" />,
        onSelect: () => {
          const item = store.queue.find((q) => q.track?.id === track.id)
          if (item) store.queueOnReorder(item.id, queueItemCount - 1)
        },
      }
    )
  }

  items.push({ type: "separator" })

  /* Add to Playlist */
  items.push(buildAddToPlaylistSubmenu(track, currentPlaylistId))

  items.push({ type: "separator" })

  /* Like */
  items.push({
    type: "item",
    label: isLiked ? "Unlike" : "Like",
    icon: <Heart className={isLiked ? "h-4 w-4 fill-current text-accent" : "h-4 w-4"} />,
    onSelect: () => store.handleToggleLikeTrack(track),
  })

  /* Download */
  if (isDownloaded) {
    items.push({
      type: "item",
      label: "Remove Download",
      icon: <XCircle className="h-4 w-4" />,
      onSelect: () => store.handleRemoveTrackDownload(track),
    })
  } else {
    items.push({
      type: "item",
      label: "Download",
      icon: <Download className="h-4 w-4" />,
      disabled: isDownloadBusy,
      onSelect: () => store.handleDownloadTrack(track),
    })
  }

  items.push({ type: "separator" })

  /* Copy */
  items.push({
    type: "item",
    label: "Copy Track URL",
    icon: <Copy className="h-4 w-4" />,
    onSelect: () => navigator.clipboard.writeText(track.canonicalUrl).catch(() => {}),
  })

  const artistTitle = [track.title, track.artist].filter(Boolean).join(" — ")
  if (artistTitle) {
    items.push({
      type: "item",
      label: "Copy Title & Artist",
      icon: <Copy className="h-4 w-4" />,
      onSelect: () => navigator.clipboard.writeText(artistTitle).catch(() => {}),
    })
  }

  /* Remove */
  if (showRemoveFromPlaylist) {
    items.push({ type: "separator" })
    items.push({
      type: "item",
      label: "Remove from Playlist",
      icon: <Trash2 className="h-4 w-4" />,
      destructive: true,
      onSelect: () =>
        store.handleRemoveFromPlaylist(
          showRemoveFromPlaylist.playlistId,
          showRemoveFromPlaylist.entryId
        ),
    })
  }

  if (showRemoveFromQueue) {
    items.push({ type: "separator" })
    items.push({
      type: "item",
      label: "Remove from Queue",
      icon: <XCircle className="h-4 w-4" />,
      destructive: true,
      onSelect: () => store.queueOnRemove(showRemoveFromQueue.queueItemId),
    })
  }

  return items
}

/* ---------------------------------------------------------------------------
 * Playlist card context menu
 * Used for: playlist grid in Workspace
 * ----------------------------------------------------------------------- */

export function buildPlaylistContextMenu(playlist: Playlist): ContextMenuItem[] {
  const store = useAppStore.getState()
  const isSystem = isSystemPlaylistId(playlist.id)

  const items: ContextMenuItem[] = []

  items.push({
    type: "item",
    label: "Play All",
    icon: <Play className="h-4 w-4" />,
    onSelect: () => store.handlePlayPlaylist(playlist),
  })

  items.push({
    type: "item",
    label: "Add to Queue",
    icon: <ListPlus className="h-4 w-4" />,
    onSelect: () => store.handleEnqueuePlaylist(playlist),
  })

  if (!isSystem && store.handleDownloadPlaylist) {
    items.push({ type: "separator" })
    items.push({
      type: "item",
      label: "Download All",
      icon: <Download className="h-4 w-4" />,
      onSelect: () => store.handleDownloadPlaylist(playlist),
    })
  }

  if (!isSystem) {
    items.push({ type: "separator" })
    if (store.openRenamePlaylist) {
      items.push({
        type: "item",
        label: "Rename",
        icon: <Pencil className="h-4 w-4" />,
        onSelect: () => store.openRenamePlaylist(playlist),
      })
    }
    if (store.openDeletePlaylist) {
      items.push({
        type: "item",
        label: "Delete",
        icon: <Trash2 className="h-4 w-4" />,
        destructive: true,
        onSelect: () => store.openDeletePlaylist(playlist),
      })
    }
  }

  items.push({ type: "separator" })
  items.push({
    type: "item",
    label: "Copy Playlist Name",
    icon: <Copy className="h-4 w-4" />,
    onSelect: () => navigator.clipboard.writeText(playlist.name).catch(() => {}),
  })

  return items
}

/* ---------------------------------------------------------------------------
 * System playlist context menu (Liked Songs, Offline)
 * Used for: NavRail items
 * ----------------------------------------------------------------------- */

export function buildSystemPlaylistContextMenu(playlistId: string): ContextMenuItem[] {
  const store = useAppStore.getState()
  const playlist = store.playlists.find((p) => p.id === playlistId)
  if (!playlist) return []

  const items: ContextMenuItem[] = []

  items.push({
    type: "item",
    label: "Play All",
    icon: <Play className="h-4 w-4" />,
    onSelect: () => store.handlePlayPlaylist(playlist),
  })

  items.push({
    type: "item",
    label: "Add to Queue",
    icon: <ListPlus className="h-4 w-4" />,
    onSelect: () => store.handleEnqueuePlaylist(playlist),
  })

  return items
}

/* ---------------------------------------------------------------------------
 * Add-to-Playlist submenu
 * Shared by track context menus
 * ----------------------------------------------------------------------- */

function buildAddToPlaylistSubmenu(track: Track, currentPlaylistId?: string): ContextMenuItem {
  const store = useAppStore.getState()
  const playlists = store.playlists

  const likedPlaylist = playlists.find((p) => p.id === LIKED_SONGS_PLAYLIST_ID)
  const userPlaylists = playlists.filter((p) => !isSystemPlaylistId(p.id))

  const submenuItems: ContextMenuItem[] = []

  /* Liked Songs (hide if already liked) */
  if (likedPlaylist && !track.likedAt) {
    submenuItems.push({
      type: "item",
      label: "Liked Songs",
      icon: <Heart className="h-4 w-4" />,
      onSelect: () => store.handleToggleLikeTrack(track),
    })
  }

  /* User playlists (exclude playlists the track is already in) */
  const availablePlaylists = userPlaylists.filter(
    (pl) => currentPlaylistId !== pl.id && !pl.tracks?.some((t) => t.id === track.id)
  )
  if (availablePlaylists.length > 0) {
    if (submenuItems.length > 0) submenuItems.push({ type: "separator" })
    for (const pl of availablePlaylists) {
      submenuItems.push({
        type: "item",
        label: pl.name,
        onSelect: () => store.handleAddTrackToPlaylist(pl.id, track),
      })
    }
  }

  /* New playlist */
  submenuItems.push({ type: "separator" })
  submenuItems.push({
    type: "item",
    label: "New Playlist…",
    icon: <Plus className="h-4 w-4" />,
    onSelect: async () => {
      try {
        const updated = await window.loopify.playlists.create("New playlist")
        const newPl = updated.find((p) => !playlists.find((old) => old.id === p.id))
        if (newPl) {
          await window.loopify.playlists.addTrack(newPl.id, track.canonicalUrl)
          await store.refreshPlaylists()
          store.openRenamePlaylist(newPl)
        }
      } catch (err) {
        store.setActionError(err instanceof Error ? err.message : "Could not create playlist.")
      }
    },
  })

  return {
    type: "submenu",
    label: "Add to Playlist",
    items: submenuItems,
  }
}

/* ---------------------------------------------------------------------------
 * Search result context menu
 * Used for: CommandPalette search results
 * ----------------------------------------------------------------------- */
