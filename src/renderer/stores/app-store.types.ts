import type {
  HomeRecommendations,
  RecommendationMetrics,
  UpdateStatus,
} from "src/shared/contracts/ipc"
import type {
  PlayerPosition,
  PlayerState,
  Playlist,
  QueueItem,
  Track,
  TrackCandidate,
} from "src/shared/types/music"
import type { StateCreator } from "zustand"
import type { PlaylistActionState } from "../features/shell/PlaylistActionModal"

export type LibraryView =
  | { kind: "collection" }
  | { kind: "discover" }
  | { kind: "playlist"; id: string }
  | { kind: "artist"; deezerId: number }
  | { kind: "album"; deezerId: number }

type BootPhase = "loading" | "ready" | "error"

export interface AppState {
  bootPhase: BootPhase
  bootError: string | null
  playerState: PlayerState | null
  playerPosition: PlayerPosition | null
  playlists: Playlist[]
  queue: QueueItem[]
  queueMap: Map<string, QueueItem>
  currentQueueItem: QueueItem | null
  currentTrackIndex: number
  hasNext: boolean
  hasPrevious: boolean
  libraryView: LibraryView
  previousLibraryView: LibraryView | null

  isSearchOpen: boolean

  isSettingsOpen: boolean
  isImportOpen: boolean
  isShortcutsOpen: boolean
  isQueueOpen: boolean
  isSidebarExpanded: boolean
  playlistAction: PlaylistActionState | null
  queueClearConfirming: boolean

  updateStatus: UpdateStatus | null
  recommendationsEnabled: boolean
  homeRecommendations: HomeRecommendations | null
  /** When Discover is open, interactions for these track IDs use this session (matches Discover impressions). */
  discoverRecommendationSessionId: string | null
  discoverRecommendationTrackIds: Set<string>
  recommendationMetrics: RecommendationMetrics | null
  dismissedUpdatePhase: string | null
  actionError: string | null
  shellReveal: boolean
  isCompactShell: boolean

  lastPlayerState: PlayerState | null

  loadInitialData: () => Promise<void>
  initSubscriptions: () => () => void

  refreshQueue: () => Promise<QueueItem[]>
  refreshPlaylists: () => Promise<Playlist[]>
  refreshPlaylistsMetadata: () => Promise<Playlist[]>
  refreshRecommendations: () => Promise<void>

  trackRecommendationInteraction: (
    trackId: string,
    type: "play" | "skip" | "like" | "save" | "dismiss",
    metadata?: string,
    options?: { sessionId?: string }
  ) => Promise<void>

  setDiscoverRecommendationContext: (sessionId: string | null, trackIds?: readonly string[]) => void

  setLibraryView: (view: LibraryView) => void
  selectPlaylistWithTransition: (id: string | null) => void
  goBack: () => void

  handlePlayPause: () => Promise<void>
  handleCycleRepeat: () => Promise<void>
  handleNext: () => Promise<void>
  handlePrevious: () => Promise<void>
  handleStop: () => Promise<void>
  handleSeek: (s: number) => Promise<void>
  handleSeekRelative: (delta: number) => Promise<void>
  handleSeekToStart: () => Promise<void>
  handleSeekNearEnd: () => Promise<void>
  handleVolumeChange: (v: number) => Promise<void>
  handleVolumeDelta: (delta: number) => Promise<void>

  handlePlayTrack: (track: Track | TrackCandidate) => Promise<void>
  handleEnqueueTrack: (track: TrackCandidate) => Promise<void>
  handleEnqueuePlaylistTrack: (track: Track) => Promise<void>
  handlePlayPlaylist: (playlist: Playlist) => Promise<void>
  handleEnqueuePlaylist: (playlist: Playlist) => Promise<void>
  handleShuffleQueue: () => Promise<void>
  playlistShuffleIds: Set<string>
  togglePlaylistShuffle: (id: string) => void
  queueOnPlay: (item: QueueItem) => Promise<void>
  queueOnRemove: (id: string) => Promise<void>
  queueOnClear: () => Promise<void>
  queueOnReorder: (id: string, newIndex: number) => Promise<void>

  handleCreatePlaylist: () => void
  openRenamePlaylist: (p: Playlist) => void
  openDeletePlaylist: (p: Playlist) => void
  submitPlaylistCreate: (name: string) => Promise<void>
  submitPlaylistRename: (id: string, name: string) => Promise<void>
  submitPlaylistDelete: (id: string) => Promise<void>
  handleRemoveFromPlaylist: (playlistId: string, entryId: string) => Promise<void>
  handleMovePlaylistTrack: (playlistId: string, entryId: string, newIndex: number) => Promise<void>
  handleToggleLikeTrack: (track: Track) => Promise<void>
  handleLikeCandidate: (track: TrackCandidate) => Promise<void>
  handleAddTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>
  handleDownloadTrack: (track: Track) => Promise<void>
  handleDownloadCandidate: (track: TrackCandidate) => Promise<void>
  handleRemoveTrackDownload: (track: Track) => Promise<void>
  handleDownloadPlaylist: (playlist: Playlist) => Promise<void>

  setActionError: (err: string | null) => void
  clearActionError: () => void
  dismissUpdate: () => void
  handleClearQueueShortcut: () => Promise<void>
  setQueueClearConfirming: (v: boolean) => void
  setIsCompactShell: (v: boolean) => void
  toggleSearch: (open?: boolean) => void
  toggleSettings: (open?: boolean) => void
  toggleImport: (open?: boolean) => void
  toggleShortcuts: (open?: boolean) => void
  toggleQueue: (open?: boolean) => void
  toggleSidebar: (open?: boolean) => void
  setShellReveal: (v: boolean) => void
  setPlaylistAction: (s: PlaylistActionState | null) => void
}

export type AppStoreSlice = StateCreator<AppState, [], [], Partial<AppState>>
