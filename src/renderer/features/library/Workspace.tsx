import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Download,
  GripVertical,
  HardDrive,
  Heart,
  Library,
  ListPlus,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { memo, useCallback, useMemo, useRef, useState } from "react"
import {
  isSystemPlaylistId,
  LIKED_SONGS_PLAYLIST_ID,
  type Playlist,
  type PlaylistTrackItem,
  type Track,
} from "src/shared/types/music"
import { Button } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { IconButton } from "@/components/IconButton"
import { cn } from "@/lib/cn"
import { DRAG_MIME_TYPES } from "@/lib/drag-drop"
import { downloadTitle, formatPlaylistMeta, formatTrackDuration } from "@/lib/music-format"
import { formatModShortcut, searchShortcutProse } from "@/lib/shortcut"
import { useAppStore } from "@/stores/app.store"
import { PlaylistArtwork } from "./PlaylistArtwork"

const PLAYLIST_TRACK_DRAG_MIME = "application/x-loopify-pl-entry"
const WORKSPACE_VIEW_TRANSITION = "workspace-page"
type PlaylistSortField = "position" | "title" | "dateAdded" | "duration"
type PlaylistSortDirection = "asc" | "desc"

function playlistArtworkTransitionName(playlistId: string) {
  return `playlist-artwork-${playlistId}`
}

function playlistNameTransitionName(playlistId: string) {
  return `playlist-name-${playlistId}`
}

function playlistCountTransitionName(playlistId: string) {
  return `playlist-count-${playlistId}`
}

export function Workspace() {
  const playlists = useAppStore((s) => s.playlists)
  const activePlaylistId = useAppStore((s) => s.activePlaylistId)
  const selectPlaylist = useAppStore((s) => s.selectPlaylistWithTransition)
  const handlePlayTrack = useAppStore((s) => s.handlePlayTrack)
  const handlePlayPlaylist = useAppStore((s) => s.handlePlayPlaylist)
  const handleEnqueuePlaylist = useAppStore((s) => s.handleEnqueuePlaylist)
  const openRenamePlaylist = useAppStore((s) => s.openRenamePlaylist)
  const openDeletePlaylist = useAppStore((s) => s.openDeletePlaylist)
  const handleRemoveFromPlaylist = useAppStore((s) => s.handleRemoveFromPlaylist)
  const handleMovePlaylistTrack = useAppStore((s) => s.handleMovePlaylistTrack)
  const handleEnqueuePlaylistTrack = useAppStore((s) => s.handleEnqueuePlaylistTrack)
  const handleToggleLikeTrack = useAppStore((s) => s.handleToggleLikeTrack)
  const handleDownloadTrack = useAppStore((s) => s.handleDownloadTrack)
  const handleRemoveTrackDownload = useAppStore((s) => s.handleRemoveTrackDownload)
  const handleDownloadPlaylist = useAppStore((s) => s.handleDownloadPlaylist)
  const handleAddTrackToPlaylist = useAppStore((s) => s.handleAddTrackToPlaylist)
  const handleCreatePlaylist = useAppStore((s) => s.handleCreatePlaylist)
  const activePlaylist = useMemo(
    () => playlists.find((p) => p.id === activePlaylistId) || null,
    [playlists, activePlaylistId]
  )
  const [sortField, setSortField] = useState<PlaylistSortField>("position")
  const [sortDirection, setSortDirection] = useState<PlaylistSortDirection>("asc")
  const [trackDropPlaylistId, setTrackDropPlaylistId] = useState<string | null>(null)
  const [isTrackDropOverOpen, setIsTrackDropOverOpen] = useState(false)

  const handlePlaylistCardDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, playlistId: string) => {
      if (!handleAddTrackToPlaylist) return
      if (!e.dataTransfer.types.includes(DRAG_MIME_TYPES.TRACK)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setTrackDropPlaylistId(playlistId)
    },
    [handleAddTrackToPlaylist]
  )

  const handlePlaylistCardDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>, playlistId: string) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setTrackDropPlaylistId((id) => (id === playlistId ? null : id))
    },
    []
  )

  const handlePlaylistCardDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, playlistId: string) => {
      if (!handleAddTrackToPlaylist) return
      const raw = e.dataTransfer.getData(DRAG_MIME_TYPES.TRACK)
      if (!raw) return
      e.preventDefault()
      setTrackDropPlaylistId(null)
      try {
        const track = JSON.parse(raw) as Track
        handleAddTrackToPlaylist(playlistId, track)
      } catch (err) {
        console.error("Failed to parse dropped track payload", err)
      }
    },
    [handleAddTrackToPlaylist]
  )

  const handleOpenPlaylistDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!handleAddTrackToPlaylist || !activePlaylist) return
      if (!e.dataTransfer.types.includes(DRAG_MIME_TYPES.TRACK)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setIsTrackDropOverOpen(true)
    },
    [handleAddTrackToPlaylist, activePlaylist]
  )

  const handleOpenPlaylistDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsTrackDropOverOpen(false)
  }, [])

  const handleOpenPlaylistDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!handleAddTrackToPlaylist || !activePlaylist) return
      const raw = e.dataTransfer.getData(DRAG_MIME_TYPES.TRACK)
      if (!raw) return
      e.preventDefault()
      setIsTrackDropOverOpen(false)
      try {
        const track = JSON.parse(raw) as Track
        handleAddTrackToPlaylist(activePlaylist.id, track)
      } catch (err) {
        console.error("Failed to parse dropped track payload", err)
      }
    },
    [handleAddTrackToPlaylist, activePlaylist]
  )

  const openPlaylist = useCallback(
    (id: string) => {
      selectPlaylist(id)
    },
    [selectPlaylist]
  )

  const backToCollection = useCallback(() => {
    if (!activePlaylist) return
    selectPlaylist(null)
  }, [activePlaylist, selectPlaylist])

  const hasTracks = activePlaylist?.tracks && activePlaylist.tracks.length > 0
  const activeTracks = useMemo(
    () => sortPlaylistTracks(activePlaylist?.tracks ?? [], sortField, sortDirection),
    [activePlaylist?.tracks, sortDirection, sortField]
  )
  const canManualReorder =
    sortField === "position" &&
    sortDirection === "asc" &&
    (activePlaylist ? !isSystemPlaylistId(activePlaylist.id) : true)

  return (
    <div className="flex min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-10 pb-10 sm:px-8 sm:pt-12 sm:pb-12 lg:px-12 lg:pt-16 lg:pb-16">
      {!activePlaylist ? (
        <div
          className="mx-auto w-full max-w-6xl"
          style={{ viewTransitionName: WORKSPACE_VIEW_TRANSITION }}
        >
          <div className="mb-6 flex flex-col gap-4 sm:mb-8">
            <h1 className="type-heading m-0 text-foreground sm:text-[1.75rem]">Collection</h1>
            <button
              type="button"
              onClick={() => useAppStore.getState().toggleSearch(true)}
              className="flex w-full max-w-md cursor-pointer items-center gap-3 rounded-xl border border-border bg-raised px-4 py-3 text-left transition-colors duration-ui ease-out-quart hover:border-white/20 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Search className="h-4 w-4 shrink-0 text-subtle" />
              <span className="type-body-sm text-subtle">Search tracks or paste a URL...</span>
              <span className="type-meta ml-auto shrink-0 text-subtle">
                {formatModShortcut("K")}
              </span>
            </button>
          </div>
          {playlists.length === 0 ? (
            <EmptyState
              className="mx-auto max-w-3xl"
              icon={<Library className="h-7 w-7" aria-hidden strokeWidth={1.35} />}
              eyebrow="Library"
              title="Start your collection with something worth replaying"
              description="Playlists live on this computer, so imports, quick finds, and saved sets stay close at hand. Search to play immediately, import an existing list, or create an empty playlist for a slower build."
              actions={
                <>
                  <Button
                    type="button"
                    size="lg"
                    className="gap-2 sm:min-w-44"
                    onClick={() => useAppStore.getState().toggleSearch(true)}
                  >
                    <Search className="h-4 w-4" aria-hidden />
                    Search ({formatModShortcut("K")})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="gap-2 border-border sm:min-w-44"
                    onClick={() => useAppStore.getState().toggleImport(true)}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Import playlist
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="lg"
                    className="gap-2 sm:min-w-44"
                    onClick={handleCreatePlaylist}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    New playlist
                  </Button>
                </>
              }
            />
          ) : (
            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {playlists.map((p) => (
                // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target container for track-to-playlist drops
                <div
                  key={p.id}
                  onDragOver={(e) => handlePlaylistCardDragOver(e, p.id)}
                  onDragLeave={(e) => handlePlaylistCardDragLeave(e, p.id)}
                  onDrop={(e) => handlePlaylistCardDrop(e, p.id)}
                  className={cn(
                    "group relative aspect-square overflow-hidden rounded-2xl border border-transparent bg-surface shadow-md transition-transform duration-ui ease-out-quart hover:scale-[1.04] hover:border-border hover:shadow-lg active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
                    trackDropPlaylistId === p.id &&
                      "scale-[1.04] border-accent shadow-lg ring-2 ring-accent/60 ring-offset-2 ring-offset-canvas"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => openPlaylist(p.id)}
                    aria-label={`Open ${p.name}`}
                    className="absolute inset-0 z-[1] cursor-pointer"
                  />
                  <div className="absolute right-3 top-3 z-20 flex items-center gap-1 opacity-100 transition-opacity duration-ui ease-out-quart sm:right-4 sm:top-4 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none motion-reduce:opacity-100">
                    <IconButton
                      size="sm"
                      title="Play playlist"
                      className="h-10 w-10 rounded-full bg-accent text-on-accent hover:bg-accent-bright"
                      onClick={() => {
                        handlePlayPlaylist?.(p)
                      }}
                    >
                      <Play className="h-5 w-5 fill-current ml-0.5" />
                    </IconButton>
                    {openRenamePlaylist && !isSystemPlaylistId(p.id) && (
                      <IconButton
                        size="sm"
                        title="Rename playlist"
                        className="h-10 w-10 rounded-full bg-canvas/90 text-foreground shadow-md backdrop-blur-sm"
                        onClick={() => {
                          openRenamePlaylist(p)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    )}
                    {openDeletePlaylist && !isSystemPlaylistId(p.id) && (
                      <IconButton
                        size="sm"
                        title="Delete playlist"
                        className="h-10 w-10 rounded-full bg-canvas/90 text-foreground shadow-md backdrop-blur-sm hover:text-danger"
                        onClick={() => {
                          openDeletePlaylist(p)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    )}
                  </div>
                  <div className="absolute inset-0 z-0 overflow-hidden">
                    <PlaylistArtwork
                      playlistId={p.id}
                      tracks={p.tracks}
                      className="h-full w-full"
                      scrim="top"
                      transitionName={playlistArtworkTransitionName(p.id)}
                    />
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 text-left">
                    <h3
                      className="type-title text-foreground drop-shadow-sm sm:text-[1.25rem]"
                      style={{ viewTransitionName: playlistNameTransitionName(p.id) }}
                    >
                      {p.name}
                    </h3>
                    <p
                      className="type-label mt-1 text-foreground/80"
                      style={{ viewTransitionName: playlistCountTransitionName(p.id) }}
                    >
                      {formatPlaylistMeta(p.tracks?.length || 0, p.totalDurationMs)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          className="mx-auto w-full max-w-5xl"
          style={{ viewTransitionName: WORKSPACE_VIEW_TRANSITION }}
        >
          <div className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
            <button
              type="button"
              onClick={backToCollection}
              className="cursor-pointer type-label text-muted transition-colors duration-ui ease-out-quart hover:text-foreground"
            >
              ← Back to Collection
            </button>
            <button
              type="button"
              onClick={() => useAppStore.getState().toggleSearch(true)}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-raised px-3 py-2 text-left transition-colors duration-ui ease-out-quart hover:border-white/20 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <Search className="h-4 w-4 shrink-0 text-subtle" />
              <span className="type-meta hidden text-subtle sm:inline">Search</span>
              <span className="type-meta text-subtle">{formatModShortcut("K")}</span>
            </button>
          </div>
          <div className="mb-6 flex flex-col gap-6 sm:mb-8 sm:flex-row sm:items-end sm:gap-8">
            <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-surface shadow-xl sm:h-48 sm:w-48 lg:h-56 lg:w-56">
              <PlaylistArtwork
                playlistId={activePlaylist.id}
                tracks={activePlaylist.tracks}
                className="h-full w-full"
                transitionName={playlistArtworkTransitionName(activePlaylist.id)}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h1
                className="type-display mb-3 text-foreground sm:mb-4 sm:text-[3.25rem] md:text-[3.75rem] lg:text-[4.5rem]"
                style={{ viewTransitionName: playlistNameTransitionName(activePlaylist.id) }}
              >
                {activePlaylist.name}
              </h1>
              <p
                className="type-label mb-6 text-accent"
                style={{ viewTransitionName: playlistCountTransitionName(activePlaylist.id) }}
              >
                {formatPlaylistMeta(
                  activePlaylist.tracks?.length || 0,
                  activePlaylist.totalDurationMs
                )}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {handlePlayPlaylist && (
                  <Button
                    size="lg"
                    onClick={() => handlePlayPlaylist(activePlaylist)}
                    disabled={!hasTracks}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Play All
                  </Button>
                )}
                {handleEnqueuePlaylist && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => handleEnqueuePlaylist(activePlaylist)}
                    disabled={!hasTracks}
                    className="gap-2"
                  >
                    <ListPlus className="h-4 w-4" />
                    Add to Queue
                  </Button>
                )}
                {handleDownloadPlaylist && (
                  <PlaylistDownloadButton
                    playlist={activePlaylist}
                    handleDownloadPlaylist={handleDownloadPlaylist}
                    disabled={!hasTracks}
                  />
                )}
                {openRenamePlaylist && !isSystemPlaylistId(activePlaylist.id) && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => openRenamePlaylist(activePlaylist)}
                    className="gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    Rename
                  </Button>
                )}
                {openDeletePlaylist && !isSystemPlaylistId(activePlaylist.id) && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => openDeletePlaylist(activePlaylist)}
                    className="gap-2 text-danger hover:opacity-90"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target container for track-to-playlist drops */}
          <div
            onDragOver={handleOpenPlaylistDragOver}
            onDragLeave={handleOpenPlaylistDragLeave}
            onDrop={handleOpenPlaylistDrop}
            className={cn(
              "transition-colors duration-ui ease-out-quart",
              isTrackDropOverOpen &&
                "rounded-2xl ring-2 ring-accent/60 ring-offset-2 ring-offset-canvas bg-accent/[0.03]"
            )}
          >
            {activePlaylist.tracks && activePlaylist.tracks.length > 0 ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <PlaylistSortControl
                  field={sortField}
                  direction={sortDirection}
                  onFieldChange={setSortField}
                  onDirectionChange={setSortDirection}
                />
                <div className="min-h-0 flex-1">
                  <PlaylistTracksList
                    playlistId={activePlaylist.id}
                    tracks={activeTracks}
                    handlePlayTrack={handlePlayTrack}
                    handleRemoveFromPlaylist={
                      isSystemPlaylistId(activePlaylist.id) ? undefined : handleRemoveFromPlaylist
                    }
                    handleMovePlaylistTrack={canManualReorder ? handleMovePlaylistTrack : undefined}
                    handleEnqueuePlaylistTrack={handleEnqueuePlaylistTrack}
                    handleToggleLikeTrack={handleToggleLikeTrack}
                    handleDownloadTrack={handleDownloadTrack}
                    handleRemoveTrackDownload={handleRemoveTrackDownload}
                  />
                </div>
              </div>
            ) : (
              (() => {
                const isSystem = isSystemPlaylistId(activePlaylist.id)
                const emptyConfig = isSystem
                  ? activePlaylist.id === LIKED_SONGS_PLAYLIST_ID
                    ? {
                        icon: <Heart className="h-6 w-6" aria-hidden strokeWidth={1.6} />,
                        eyebrow: "Liked Songs",
                        title: "No liked songs yet",
                        description: `Tap the heart on a track while it plays to save it here, or use Search to find something new. ${searchShortcutProse()}`,
                      }
                    : {
                        icon: <HardDrive className="h-6 w-6" aria-hidden strokeWidth={1.6} />,
                        eyebrow: "Offline songs",
                        title: "No offline tracks yet",
                        description: `Songs you download from other playlists or the queue will appear here for offline playback. ${searchShortcutProse()}`,
                      }
                  : {
                      icon: <ListPlus className="h-6 w-6" aria-hidden strokeWidth={1.6} />,
                      eyebrow: "Playlist",
                      title: "This playlist is ready for its first run",
                      description: `Import a playlist URL to fill it in one move, or use Search to play and queue tracks before you decide what belongs here. ${searchShortcutProse()}`,
                    }
                return (
                  <EmptyState
                    className="mx-auto mt-6 max-w-2xl sm:mt-10"
                    icon={emptyConfig.icon}
                    eyebrow={emptyConfig.eyebrow}
                    title={emptyConfig.title}
                    description={emptyConfig.description}
                    actions={
                      <>
                        {!isSystem && (
                          <Button
                            type="button"
                            size="lg"
                            className="gap-2"
                            onClick={() => useAppStore.getState().toggleImport(true)}
                          >
                            <Download className="h-4 w-4" aria-hidden />
                            Import
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          className="gap-2 border-border"
                          onClick={() => useAppStore.getState().toggleSearch(true)}
                        >
                          <Search className="h-4 w-4" aria-hidden />
                          Search
                        </Button>
                      </>
                    }
                  />
                )
              })()
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PlaylistDownloadButton({
  playlist,
  disabled,
  handleDownloadPlaylist,
}: {
  playlist: Playlist
  disabled: boolean
  handleDownloadPlaylist: (playlist: Playlist) => void
}) {
  const tracks = playlist.tracks ?? []
  const downloadable = tracks.filter((track) => track.downloadStatus !== "downloaded")
  const downloading = tracks.filter(
    (track) => track.downloadStatus === "queued" || track.downloadStatus === "downloading"
  )
  const downloaded = tracks.length > 0 && downloadable.length === 0
  const progress =
    downloading.length > 0
      ? Math.round(
          tracks.reduce((total, track) => total + track.downloadProgress, 0) / tracks.length
        )
      : 0
  const label = downloaded
    ? "Downloaded"
    : downloading.length > 0
      ? `Downloading ${progress}%`
      : "Download"

  return (
    <Button
      variant="ghost"
      size="lg"
      onClick={() => handleDownloadPlaylist(playlist)}
      disabled={disabled || downloaded || downloading.length > 0}
      className="gap-2"
    >
      {downloaded ? <CheckCircle2 className="h-4 w-4" /> : <Download className="h-4 w-4" />}
      {label}
    </Button>
  )
}

function PlaylistSortControl({
  field,
  direction,
  onFieldChange,
  onDirectionChange,
}: {
  field: PlaylistSortField
  direction: PlaylistSortDirection
  onFieldChange: (field: PlaylistSortField) => void
  onDirectionChange: (direction: PlaylistSortDirection) => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.03] p-2">
      <span className="type-meta flex items-center gap-2 px-2 text-subtle">
        <ArrowUpDown className="h-4 w-4" />
        Sort
      </span>
      {(
        [
          ["position", "Position"],
          ["title", "Title"],
          ["dateAdded", "Date added"],
          ["duration", "Duration"],
        ] as const
      ).map(([value, label]) => (
        <button
          type="button"
          key={value}
          onClick={() => onFieldChange(value)}
          className={cn(
            "type-label cursor-pointer rounded-lg px-3 py-2 transition-colors duration-ui ease-out-quart focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            field === value ? "bg-white/10 text-foreground" : "text-muted hover:bg-white/5"
          )}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onDirectionChange(direction === "asc" ? "desc" : "asc")}
        className="type-label cursor-pointer ml-auto rounded-lg px-3 py-2 text-muted transition-colors duration-ui ease-out-quart hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {direction === "asc" ? "Ascending" : "Descending"}
      </button>
    </div>
  )
}

const VIRTUALIZATION_THRESHOLD = 120
const TRACK_ROW_ESTIMATE = 56

function PlaylistTracksList({
  playlistId,
  tracks,
  handlePlayTrack,
  handleRemoveFromPlaylist,
  handleMovePlaylistTrack,
  handleEnqueuePlaylistTrack,
  handleToggleLikeTrack,
  handleDownloadTrack,
  handleRemoveTrackDownload,
}: {
  playlistId: string
  tracks: PlaylistTrackItem[]
  handlePlayTrack: (t: Track) => void
  handleRemoveFromPlaylist?: (playlistId: string, entryId: string) => void
  handleMovePlaylistTrack?: (playlistId: string, entryId: string, newIndex: number) => void
  handleEnqueuePlaylistTrack?: (track: Track) => void
  handleToggleLikeTrack?: (track: Track) => void
  handleDownloadTrack?: (track: Track) => void
  handleRemoveTrackDownload?: (track: Track) => void
}) {
  const [draggingEntryId, setDraggingEntryId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const draggingEntryRef = useRef<string | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = tracks.length > VIRTUALIZATION_THRESHOLD

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => TRACK_ROW_ESTIMATE,
    overscan: 10,
    enabled: shouldVirtualize,
  })

  const canReorder = Boolean(handleMovePlaylistTrack) && tracks.length > 1 && !shouldVirtualize

  const handleDragStart = useCallback(
    (e: React.DragEvent, entryId: string) => {
      if (!canReorder) return
      e.dataTransfer.setData(PLAYLIST_TRACK_DRAG_MIME, entryId)
      e.dataTransfer.effectAllowed = "move"
      draggingEntryRef.current = entryId
      setDraggingEntryId(entryId)
    },
    [canReorder]
  )

  const handleDragEnd = useCallback(() => {
    draggingEntryRef.current = null
    setDraggingEntryId(null)
    setDragOverIndex(null)
  }, [])

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      if (!canReorder || draggingEntryRef.current === null) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "move"
      setDragOverIndex(index)
    },
    [canReorder]
  )

  const handleDragLeave = useCallback((e: React.DragEvent, index: number) => {
    const related = e.relatedTarget as Node | null
    if (related && e.currentTarget.contains(related)) return
    setDragOverIndex((cur) => (cur === index ? null : cur))
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault()
      setDragOverIndex(null)
      const entryId = e.dataTransfer.getData(PLAYLIST_TRACK_DRAG_MIME)
      draggingEntryRef.current = null
      setDraggingEntryId(null)
      if (!entryId || !handleMovePlaylistTrack) return
      const fromIndex = tracks.findIndex((t) => t.playlistEntryId === entryId)
      if (fromIndex < 0 || fromIndex === dropIndex) return
      void handleMovePlaylistTrack(playlistId, entryId, dropIndex)
    },
    [handleMovePlaylistTrack, playlistId, tracks]
  )

  const removeEntry = useCallback(
    (entryId: string) => handleRemoveFromPlaylist?.(playlistId, entryId),
    [handleRemoveFromPlaylist, playlistId]
  )
  const moveEntry = useCallback(
    (entryId: string, newIndex: number) => handleMovePlaylistTrack?.(playlistId, entryId, newIndex),
    [handleMovePlaylistTrack, playlistId]
  )
  const enqueueEntry = useCallback(
    (t: Track) => handleEnqueuePlaylistTrack?.(t),
    [handleEnqueuePlaylistTrack]
  )
  const toggleLike = useCallback((t: Track) => handleToggleLikeTrack?.(t), [handleToggleLikeTrack])
  const downloadTrack = useCallback((t: Track) => handleDownloadTrack?.(t), [handleDownloadTrack])
  const removeDownload = useCallback(
    (t: Track) => handleRemoveTrackDownload?.(t),
    [handleRemoveTrackDownload]
  )

  const renderRow = (track: PlaylistTrackItem, i: number, virtualStyle?: React.CSSProperties) => (
    <PlaylistTrackRow
      key={track.playlistEntryId}
      track={track}
      index={i}
      trackCount={tracks.length}
      handlePlayTrack={handlePlayTrack}
      onRemoveEntry={
        handleRemoveFromPlaylist && !isSystemPlaylistId(playlistId) ? removeEntry : undefined
      }
      onMoveEntry={handleMovePlaylistTrack ? moveEntry : undefined}
      onEnqueueTrack={handleEnqueuePlaylistTrack ? enqueueEntry : undefined}
      handleToggleLikeTrack={handleToggleLikeTrack ? toggleLike : undefined}
      handleDownloadTrack={handleDownloadTrack ? downloadTrack : undefined}
      handleRemoveTrackDownload={handleRemoveTrackDownload ? removeDownload : undefined}
      isDragging={draggingEntryId === track.playlistEntryId}
      isDropTarget={dragOverIndex === i && draggingEntryId !== null}
      onDragHandleStart={(e) => handleDragStart(e, track.playlistEntryId)}
      onDragHandleEnd={handleDragEnd}
      onRowDragOver={(e) => handleDragOver(e, i)}
      onRowDragLeave={(e) => handleDragLeave(e, i)}
      onRowDrop={(e) => handleDrop(e, i)}
      virtualStyle={virtualStyle}
    />
  )

  if (!shouldVirtualize) {
    return (
      <ol aria-label="Playlist tracks" className="m-0 flex list-none flex-col gap-1 p-0">
        {tracks.map((track, i) => renderRow(track, i))}
      </ol>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
      <ol
        aria-label="Playlist tracks"
        className="m-0 list-none p-0"
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualItems.map((virtualItem) => {
          const track = tracks[virtualItem.index]
          return renderRow(track, virtualItem.index, {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            transform: `translateY(${virtualItem.start}px)`,
          })
        })}
      </ol>
    </div>
  )
}

const PlaylistTrackRow = memo(function PlaylistTrackRow({
  track,
  index,
  trackCount,
  handlePlayTrack,
  onRemoveEntry,
  onMoveEntry,
  onEnqueueTrack,
  handleToggleLikeTrack,
  handleDownloadTrack,
  handleRemoveTrackDownload,
  isDragging,
  isDropTarget,
  onDragHandleStart,
  onDragHandleEnd,
  onRowDragOver,
  onRowDragLeave,
  onRowDrop,
  virtualStyle,
}: {
  track: PlaylistTrackItem
  index: number
  trackCount: number
  handlePlayTrack: (t: Track) => void
  onRemoveEntry?: (entryId: string) => void
  onMoveEntry?: (entryId: string, newIndex: number) => void
  onEnqueueTrack?: (t: Track) => void
  handleToggleLikeTrack?: (t: Track) => void
  handleDownloadTrack?: (t: Track) => void
  handleRemoveTrackDownload?: (t: Track) => void
  isDragging: boolean
  isDropTarget: boolean
  onDragHandleStart: (e: React.DragEvent) => void
  onDragHandleEnd: () => void
  onRowDragOver: (e: React.DragEvent) => void
  onRowDragLeave: (e: React.DragEvent) => void
  onRowDrop: (e: React.DragEvent) => void
  virtualStyle?: React.CSSProperties
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const canReorder = Boolean(onMoveEntry) && trackCount > 1
  const entryId = track.playlistEntryId

  const onPlay = useCallback(() => handlePlayTrack(track), [handlePlayTrack, track])
  const onRemove = useCallback(() => {
    if (!onRemoveEntry) return
    if (!confirmingRemove) {
      setConfirmingRemove(true)
      return
    }
    setConfirmingRemove(false)
    onRemoveEntry(entryId)
  }, [confirmingRemove, onRemoveEntry, entryId])
  const onEnqueue = useCallback(() => onEnqueueTrack?.(track), [onEnqueueTrack, track])
  const onToggleLike = useCallback(
    () => handleToggleLikeTrack?.(track),
    [handleToggleLikeTrack, track]
  )
  const onDownload = useCallback(() => handleDownloadTrack?.(track), [handleDownloadTrack, track])
  const onRemoveDownload = useCallback(
    () => handleRemoveTrackDownload?.(track),
    [handleRemoveTrackDownload, track]
  )
  const onMoveUp = useCallback(() => {
    if (!onMoveEntry || index <= 0) return
    onMoveEntry(entryId, index - 1)
  }, [onMoveEntry, entryId, index])
  const onMoveDown = useCallback(() => {
    if (!onMoveEntry || index >= trackCount - 1) return
    onMoveEntry(entryId, index + 1)
  }, [onMoveEntry, entryId, index, trackCount])
  const durationLabel = useMemo(() => formatTrackDuration(track.durationMs), [track.durationMs])
  const isLiked = Boolean(track.likedAt)
  const isDownloaded = track.downloadStatus === "downloaded"
  const isDownloadBusy = track.downloadStatus === "queued" || track.downloadStatus === "downloading"

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!canReorder) return
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault()
        onMoveUp()
      } else if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault()
        onMoveDown()
      }
    },
    [canReorder, onMoveUp, onMoveDown]
  )

  return (
    <li
      style={virtualStyle}
      className={cn(
        "[contain-intrinsic-size:3.25rem] [content-visibility:auto] group flex w-full list-none items-center gap-1 rounded-xl border border-transparent px-1 py-2 transition-[colors,transform,box-shadow,opacity] duration-ui ease-out-quart hover:border-border hover:bg-surface",
        isDragging &&
          "scale-[0.98] shadow-lg opacity-40 motion-reduce:scale-100 motion-reduce:shadow-none",
        isDropTarget && "border-accent bg-accent/10"
      )}
      onDragOver={canReorder ? onRowDragOver : undefined}
      onDragLeave={canReorder ? onRowDragLeave : undefined}
      onDrop={canReorder ? onRowDrop : undefined}
      onKeyDown={handleRowKeyDown}
    >
      {canReorder && (
        <IconButton
          type="button"
          draggable
          size="sm"
          title="Drag to reorder"
          aria-label="Drag to reorder"
          aria-grabbed={isDragging}
          className="h-9 w-7 shrink-0 cursor-grab touch-none active:cursor-grabbing"
          onDragStart={onDragHandleStart}
          onDragEnd={onDragHandleEnd}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </IconButton>
      )}
      <button
        type="button"
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-4 rounded-lg py-1 pl-1 text-left"
        onClick={onPlay}
      >
        <span className="type-body-sm w-8 text-center tabular-nums text-muted group-hover:hidden">
          {index + 1}
        </span>
        <span className="hidden w-8 shrink-0 items-center justify-center text-foreground group-hover:flex">
          <Play className="h-4 w-4 fill-current" />
        </span>
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-raised">
          {track.thumbnailUrl && (
            <img
              src={track.thumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="type-body-sm truncate text-foreground">{track.title}</span>
          <span className="type-meta truncate text-muted">{track.artist}</span>
        </div>
        <span className="type-body-sm shrink-0 tabular-nums text-subtle">{durationLabel}</span>
      </button>
      {(onEnqueueTrack ||
        handleToggleLikeTrack ||
        handleDownloadTrack ||
        canReorder ||
        onRemoveEntry) && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {handleToggleLikeTrack && (
            <IconButton
              type="button"
              size="sm"
              title={isLiked ? "Unlike song" : "Like song"}
              active={isLiked}
              onClick={(e) => {
                e.stopPropagation()
                onToggleLike()
              }}
            >
              <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
            </IconButton>
          )}
          {handleDownloadTrack && (
            <IconButton
              type="button"
              size="sm"
              title={downloadTitle(track.downloadStatus, track.downloadProgress)}
              active={isDownloaded}
              disabled={isDownloadBusy}
              onClick={(e) => {
                e.stopPropagation()
                if (isDownloaded) onRemoveDownload()
                else onDownload()
              }}
            >
              {isDownloaded ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </IconButton>
          )}
          {onEnqueueTrack && (
            <IconButton
              type="button"
              size="sm"
              title="Append to queue"
              onClick={(e) => {
                e.stopPropagation()
                onEnqueue()
              }}
            >
              <ListPlus className="h-4 w-4" />
            </IconButton>
          )}
          {canReorder && (
            <>
              <IconButton
                type="button"
                size="sm"
                title="Move up (Alt+Up)"
                aria-label="Move track up"
                disabled={index <= 0}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveUp()
                }}
              >
                <ArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton
                type="button"
                size="sm"
                title="Move down (Alt+Down)"
                aria-label="Move track down"
                disabled={index >= trackCount - 1}
                onClick={(e) => {
                  e.stopPropagation()
                  onMoveDown()
                }}
              >
                <ArrowDown className="h-4 w-4" />
              </IconButton>
            </>
          )}
          {onRemoveEntry && (
            <button
              type="button"
              title={confirmingRemove ? "Confirm remove from playlist" : "Remove from playlist"}
              aria-label={
                confirmingRemove
                  ? `Confirm removing ${track.title} from playlist`
                  : `Remove ${track.title} from playlist`
              }
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-md px-2 text-[0.8125rem] font-medium tracking-[0.01em] transition-[colors,transform] duration-ui ease-out-quart active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                confirmingRemove
                  ? "bg-danger text-on-accent hover:bg-danger/90"
                  : "text-muted hover:bg-white/5 hover:text-danger"
              )}
              onClick={(e) => {
                e.stopPropagation()
                onRemove()
              }}
            >
              {confirmingRemove ? "Remove?" : <Trash2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      )}
    </li>
  )
})

function sortPlaylistTracks(
  tracks: PlaylistTrackItem[],
  field: PlaylistSortField,
  direction: PlaylistSortDirection
): PlaylistTrackItem[] {
  if (field === "position") {
    return direction === "asc" ? tracks : [...tracks].reverse()
  }
  const multiplier = direction === "asc" ? 1 : -1
  return [...tracks].sort((left, right) => {
    if (field === "title") {
      return multiplier * left.title.localeCompare(right.title)
    }
    if (field === "dateAdded") {
      return multiplier * ((left.addedAt ?? 0) - (right.addedAt ?? 0))
    }
    if (field === "duration") {
      return multiplier * ((left.durationMs ?? 0) - (right.durationMs ?? 0))
    }
    return 0
  })
}
