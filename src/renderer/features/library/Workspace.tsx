import { useVirtualizer } from "@tanstack/react-virtual"
import {
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

interface WorkspaceProps {
  activePlaylist: Playlist | null
  playlists: Playlist[]
  onPlayTrack: (t: Track) => void
  onSelectPlaylist: (id: string | null) => void
  onPlayPlaylist?: (playlist: Playlist) => void
  onEnqueuePlaylist?: (playlist: Playlist) => void
  onRequestRenamePlaylist?: (playlist: Playlist) => void
  onRequestDeletePlaylist?: (playlist: Playlist) => void
  onRemoveTrackFromPlaylist?: (playlistId: string, entryId: string) => void
  onMovePlaylistTrack?: (playlistId: string, entryId: string, newIndex: number) => void
  onEnqueuePlaylistTrack?: (track: Track) => void
  onToggleLikeTrack?: (track: Track) => void
  onDownloadTrack?: (track: Track) => void
  onRemoveTrackDownload?: (track: Track) => void
  onDownloadPlaylist?: (playlist: Playlist) => void
  onAddTrackToPlaylist?: (playlistId: string, track: Track) => void
  onOpenSearch?: () => void
  onOpenImport?: () => void
  onCreatePlaylist?: () => void
}

export function Workspace({
  activePlaylist,
  playlists,
  onPlayTrack,
  onSelectPlaylist,
  onPlayPlaylist,
  onEnqueuePlaylist,
  onRequestRenamePlaylist,
  onRequestDeletePlaylist,
  onRemoveTrackFromPlaylist,
  onMovePlaylistTrack,
  onEnqueuePlaylistTrack,
  onToggleLikeTrack,
  onDownloadTrack,
  onRemoveTrackDownload,
  onDownloadPlaylist,
  onAddTrackToPlaylist,
  onOpenSearch,
  onOpenImport,
  onCreatePlaylist,
}: WorkspaceProps) {
  const [sortField, setSortField] = useState<PlaylistSortField>("position")
  const [sortDirection, setSortDirection] = useState<PlaylistSortDirection>("asc")
  const [trackDropPlaylistId, setTrackDropPlaylistId] = useState<string | null>(null)

  const handlePlaylistCardDragOver = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, playlistId: string) => {
      if (!onAddTrackToPlaylist) return
      if (!e.dataTransfer.types.includes(DRAG_MIME_TYPES.TRACK)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setTrackDropPlaylistId(playlistId)
    },
    [onAddTrackToPlaylist]
  )

  const handlePlaylistCardDragLeave = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, playlistId: string) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
      setTrackDropPlaylistId((id) => (id === playlistId ? null : id))
    },
    []
  )

  const handlePlaylistCardDrop = useCallback(
    (e: React.DragEvent<HTMLButtonElement>, playlistId: string) => {
      if (!onAddTrackToPlaylist) return
      const raw = e.dataTransfer.getData(DRAG_MIME_TYPES.TRACK)
      if (!raw) return
      e.preventDefault()
      setTrackDropPlaylistId(null)
      try {
        const track = JSON.parse(raw) as Track
        onAddTrackToPlaylist(playlistId, track)
      } catch (err) {
        console.error("Failed to parse dropped track payload", err)
      }
    },
    [onAddTrackToPlaylist]
  )

  const openPlaylist = useCallback(
    (id: string) => {
      onSelectPlaylist(id)
    },
    [onSelectPlaylist]
  )

  const backToCollection = useCallback(() => {
    if (!activePlaylist) return
    onSelectPlaylist(null)
  }, [activePlaylist, onSelectPlaylist])

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
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex w-full max-w-md cursor-pointer items-center gap-3 rounded-xl border border-border bg-raised px-4 py-3 text-left transition-colors duration-ui ease-out-quart hover:border-white/20 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Search className="h-4 w-4 shrink-0 text-subtle" />
                <span className="type-body-sm text-subtle">Search tracks or paste a URL...</span>
                <span className="type-meta ml-auto shrink-0 text-subtle">
                  {formatModShortcut("K")}
                </span>
              </button>
            )}
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
                  {onOpenSearch && (
                    <Button
                      type="button"
                      size="lg"
                      className="gap-2 sm:min-w-44"
                      onClick={onOpenSearch}
                    >
                      <Search className="h-4 w-4" aria-hidden />
                      Search ({formatModShortcut("K")})
                    </Button>
                  )}
                  {onOpenImport && (
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="gap-2 border-border sm:min-w-44"
                      onClick={onOpenImport}
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      Import playlist
                    </Button>
                  )}
                  {onCreatePlaylist && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="lg"
                      className="gap-2 sm:min-w-44"
                      onClick={onCreatePlaylist}
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      New playlist
                    </Button>
                  )}
                </>
              }
            />
          ) : (
            <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {playlists.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => openPlaylist(p.id)}
                  onDragOver={(e) => handlePlaylistCardDragOver(e, p.id)}
                  onDragLeave={(e) => handlePlaylistCardDragLeave(e, p.id)}
                  onDrop={(e) => handlePlaylistCardDrop(e, p.id)}
                  className={cn(
                    "group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border border-transparent bg-surface text-left shadow-md transition-transform duration-ui ease-out-quart hover:scale-[1.04] hover:border-border hover:shadow-lg active:scale-[0.98] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
                    trackDropPlaylistId === p.id &&
                      "scale-[1.04] border-accent shadow-lg ring-2 ring-accent/60 ring-offset-2 ring-offset-canvas"
                  )}
                >
                  <div className="absolute right-3 top-3 z-20 flex items-center gap-1 opacity-100 transition-opacity duration-ui ease-out-quart sm:right-4 sm:top-4 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none motion-reduce:opacity-100">
                    <IconButton
                      type="button"
                      size="sm"
                      title="Play playlist"
                      className="h-10 w-10 rounded-full bg-accent text-on-accent hover:bg-accent-bright"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPlayPlaylist?.(p)
                      }}
                    >
                      <Play className="h-5 w-5 fill-current ml-0.5" />
                    </IconButton>
                    {onRequestRenamePlaylist && !isSystemPlaylistId(p.id) && (
                      <IconButton
                        type="button"
                        size="sm"
                        title="Rename playlist"
                        className="h-10 w-10 rounded-full bg-canvas/90 text-foreground shadow-md backdrop-blur-sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRequestRenamePlaylist(p)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                    )}
                    {onRequestDeletePlaylist && !isSystemPlaylistId(p.id) && (
                      <IconButton
                        type="button"
                        size="sm"
                        title="Delete playlist"
                        className="h-10 w-10 rounded-full bg-canvas/90 text-foreground shadow-md backdrop-blur-sm hover:text-danger"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRequestDeletePlaylist(p)
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
                  <div className="absolute inset-x-0 top-0 z-10 p-5 text-left">
                    <h3
                      className="type-title text-foreground drop-shadow-sm sm:text-[1.25rem]"
                      style={{ viewTransitionName: playlistNameTransitionName(p.id) }}
                    >
                      {p.name}
                    </h3>
                    <p
                      className="type-label mt-1 text-foreground/78"
                      style={{ viewTransitionName: playlistCountTransitionName(p.id) }}
                    >
                      {formatPlaylistMeta(p.tracks?.length || 0, p.totalDurationMs)}
                    </p>
                  </div>
                </button>
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
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-raised px-3 py-2 text-left transition-colors duration-ui ease-out-quart hover:border-white/20 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Search className="h-4 w-4 shrink-0 text-subtle" />
                <span className="type-meta hidden text-subtle sm:inline">Search</span>
                <span className="type-meta text-subtle">{formatModShortcut("K")}</span>
              </button>
            )}
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
                {onPlayPlaylist && (
                  <Button
                    size="lg"
                    onClick={() => onPlayPlaylist(activePlaylist)}
                    disabled={!hasTracks}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Play All
                  </Button>
                )}
                {onEnqueuePlaylist && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => onEnqueuePlaylist(activePlaylist)}
                    disabled={!hasTracks}
                    className="gap-2"
                  >
                    <ListPlus className="h-4 w-4" />
                    Add to Queue
                  </Button>
                )}
                {onDownloadPlaylist && (
                  <PlaylistDownloadButton
                    playlist={activePlaylist}
                    onDownloadPlaylist={onDownloadPlaylist}
                    disabled={!hasTracks}
                  />
                )}
                {onRequestRenamePlaylist && !isSystemPlaylistId(activePlaylist.id) && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => onRequestRenamePlaylist(activePlaylist)}
                    className="gap-2"
                  >
                    <Pencil className="h-4 w-4" />
                    Rename
                  </Button>
                )}
                {onRequestDeletePlaylist && !isSystemPlaylistId(activePlaylist.id) && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() => onRequestDeletePlaylist(activePlaylist)}
                    className="gap-2 text-danger hover:opacity-90"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </div>

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
                  onPlayTrack={onPlayTrack}
                  onRemoveTrackFromPlaylist={
                    isSystemPlaylistId(activePlaylist.id) ? undefined : onRemoveTrackFromPlaylist
                  }
                  onMovePlaylistTrack={canManualReorder ? onMovePlaylistTrack : undefined}
                  onEnqueuePlaylistTrack={onEnqueuePlaylistTrack}
                  onToggleLikeTrack={onToggleLikeTrack}
                  onDownloadTrack={onDownloadTrack}
                  onRemoveTrackDownload={onRemoveTrackDownload}
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
                      {onOpenImport && !isSystem && (
                        <Button type="button" size="lg" className="gap-2" onClick={onOpenImport}>
                          <Download className="h-4 w-4" aria-hidden />
                          Import
                        </Button>
                      )}
                      {onOpenSearch && (
                        <Button
                          type="button"
                          variant="outline"
                          size="lg"
                          className="gap-2 border-border"
                          onClick={onOpenSearch}
                        >
                          <Search className="h-4 w-4" aria-hidden />
                          Search
                        </Button>
                      )}
                    </>
                  }
                />
              )
            })()
          )}
        </div>
      )}
    </div>
  )
}

function PlaylistDownloadButton({
  playlist,
  disabled,
  onDownloadPlaylist,
}: {
  playlist: Playlist
  disabled: boolean
  onDownloadPlaylist: (playlist: Playlist) => void
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
      onClick={() => onDownloadPlaylist(playlist)}
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
  onPlayTrack,
  onRemoveTrackFromPlaylist,
  onMovePlaylistTrack,
  onEnqueuePlaylistTrack,
  onToggleLikeTrack,
  onDownloadTrack,
  onRemoveTrackDownload,
}: {
  playlistId: string
  tracks: PlaylistTrackItem[]
  onPlayTrack: (t: Track) => void
  onRemoveTrackFromPlaylist?: (playlistId: string, entryId: string) => void
  onMovePlaylistTrack?: (playlistId: string, entryId: string, newIndex: number) => void
  onEnqueuePlaylistTrack?: (track: Track) => void
  onToggleLikeTrack?: (track: Track) => void
  onDownloadTrack?: (track: Track) => void
  onRemoveTrackDownload?: (track: Track) => void
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

  const canReorder = Boolean(onMovePlaylistTrack) && tracks.length > 1 && !shouldVirtualize

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
      if (!entryId || !onMovePlaylistTrack) return
      const fromIndex = tracks.findIndex((t) => t.playlistEntryId === entryId)
      if (fromIndex < 0 || fromIndex === dropIndex) return
      void onMovePlaylistTrack(playlistId, entryId, dropIndex)
    },
    [onMovePlaylistTrack, playlistId, tracks]
  )

  const removeEntry = useCallback(
    (entryId: string) => onRemoveTrackFromPlaylist?.(playlistId, entryId),
    [onRemoveTrackFromPlaylist, playlistId]
  )
  const moveEntry = useCallback(
    (entryId: string, newIndex: number) => onMovePlaylistTrack?.(playlistId, entryId, newIndex),
    [onMovePlaylistTrack, playlistId]
  )
  const enqueueEntry = useCallback(
    (t: Track) => onEnqueuePlaylistTrack?.(t),
    [onEnqueuePlaylistTrack]
  )
  const toggleLike = useCallback((t: Track) => onToggleLikeTrack?.(t), [onToggleLikeTrack])
  const downloadTrack = useCallback((t: Track) => onDownloadTrack?.(t), [onDownloadTrack])
  const removeDownload = useCallback(
    (t: Track) => onRemoveTrackDownload?.(t),
    [onRemoveTrackDownload]
  )

  const renderRow = (track: PlaylistTrackItem, i: number, virtualStyle?: React.CSSProperties) => (
    <PlaylistTrackRow
      key={track.playlistEntryId}
      track={track}
      index={i}
      trackCount={tracks.length}
      onPlayTrack={onPlayTrack}
      onRemoveEntry={
        onRemoveTrackFromPlaylist && !isSystemPlaylistId(playlistId) ? removeEntry : undefined
      }
      onMoveEntry={onMovePlaylistTrack ? moveEntry : undefined}
      onEnqueueTrack={onEnqueuePlaylistTrack ? enqueueEntry : undefined}
      onToggleLikeTrack={onToggleLikeTrack ? toggleLike : undefined}
      onDownloadTrack={onDownloadTrack ? downloadTrack : undefined}
      onRemoveTrackDownload={onRemoveTrackDownload ? removeDownload : undefined}
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
  onPlayTrack,
  onRemoveEntry,
  onMoveEntry,
  onEnqueueTrack,
  onToggleLikeTrack,
  onDownloadTrack,
  onRemoveTrackDownload,
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
  onPlayTrack: (t: Track) => void
  onRemoveEntry?: (entryId: string) => void
  onMoveEntry?: (entryId: string, newIndex: number) => void
  onEnqueueTrack?: (t: Track) => void
  onToggleLikeTrack?: (t: Track) => void
  onDownloadTrack?: (t: Track) => void
  onRemoveTrackDownload?: (t: Track) => void
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

  const onPlay = useCallback(() => onPlayTrack(track), [onPlayTrack, track])
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
  const onToggleLike = useCallback(() => onToggleLikeTrack?.(track), [onToggleLikeTrack, track])
  const onDownload = useCallback(() => onDownloadTrack?.(track), [onDownloadTrack, track])
  const onRemoveDownload = useCallback(
    () => onRemoveTrackDownload?.(track),
    [onRemoveTrackDownload, track]
  )
  const durationLabel = useMemo(() => formatTrackDuration(track.durationMs), [track.durationMs])
  const isLiked = Boolean(track.likedAt)
  const isDownloaded = track.downloadStatus === "downloaded"
  const isDownloadBusy = track.downloadStatus === "queued" || track.downloadStatus === "downloading"

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
      {(onEnqueueTrack || onToggleLikeTrack || onDownloadTrack || canReorder || onRemoveEntry) && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {onToggleLikeTrack && (
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
          {onDownloadTrack && (
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
