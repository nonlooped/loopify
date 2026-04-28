import type {
  AppSettings,
  CatalogTrack,
  ImportJob,
  LyricsState,
  PlayerState,
  PlayerTrack,
  Playlist,
  QueueItem,
  RepeatMode,
  ResolvedTrack,
  Track,
  TrackCandidate,
} from "../types/music"

export type SearchQuery = {
  text: string
  providers?: string[]
}

export type QueueAddInput = {
  sourceUrl: string
  playNow?: boolean
}

/** Replace queue, then add all URLs, play the first; or append all and resolve in the background. */
export type QueueAddManyInput = {
  sourceUrls: string[]
  /** When true, stop, clear, add all, then play the first item (playlist "Play all"). */
  playFromStart: boolean
}

export type ImportStartInput = {
  url: string
  targetPlaylistId: string | null
}

export type UpdateStatusPhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "up-to-date"
  | "unsupported"
  | "error"

export type UpdateStatus = {
  phase: UpdateStatusPhase
  currentVersion: string
  availableVersion: string | null
  progressPercent: number | null
  message: string | null
}

export type LoopifyApi = {
  window: {
    minimize: () => void
    maximize: () => void
    unmaximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    onMaximizedChange: (listener: (maximized: boolean) => void) => () => void
  }
  player: {
    getState: () => Promise<PlayerState>
    play: (queueItemId: string) => Promise<PlayerState>
    pause: () => Promise<PlayerState>
    resume: () => Promise<PlayerState>
    stop: () => Promise<PlayerState>
    seek: (seconds: number) => Promise<PlayerState>
    setVolume: (volume: number) => Promise<PlayerState>
    setRepeatMode: (mode: RepeatMode) => Promise<PlayerState>
    onStateChange: (listener: (state: PlayerState) => void) => () => void
  }
  search: {
    query: (input: SearchQuery) => Promise<CatalogTrack[]>
  }
  resolver: {
    resolve: (input: string) => Promise<ResolvedTrack>
    resolveCatalog: (track: CatalogTrack) => Promise<TrackCandidate>
  }
  queue: {
    list: () => Promise<QueueItem[]>
    add: (input: QueueAddInput) => Promise<QueueItem[]>
    addMany: (input: QueueAddManyInput) => Promise<QueueItem[]>
    remove: (id: string) => Promise<QueueItem[]>
    move: (id: string, sortOrder: number) => Promise<QueueItem[]>
    shuffle: () => Promise<QueueItem[]>
    clear: () => Promise<QueueItem[]>
    onChange: (listener: (queue: QueueItem[]) => void) => () => void
  }
  playlists: {
    list: () => Promise<Playlist[]>
    create: (name: string) => Promise<Playlist[]>
    rename: (id: string, name: string) => Promise<Playlist[]>
    delete: (id: string) => Promise<Playlist[]>
    addTrack: (playlistId: string, sourceUrl: string) => Promise<Playlist[]>
    removeTrack: (playlistId: string, entryId: string) => Promise<Playlist[]>
    moveTrack: (playlistId: string, entryId: string, newIndex: number) => Promise<Playlist[]>
  }
  tracks: {
    setLiked: (trackId: string, liked: boolean) => Promise<Track>
    setCandidateLiked: (candidate: TrackCandidate, liked: boolean) => Promise<Track>
  }
  downloads: {
    downloadTrack: (trackId: string) => Promise<Track>
    downloadCandidate: (candidate: TrackCandidate) => Promise<Track>
    downloadPlaylist: (playlistId: string) => Promise<Playlist[]>
    removeTrackDownload: (trackId: string) => Promise<Track>
    onChange: (listener: (track: Track) => void) => () => void
  }
  imports: {
    start: (input: ImportStartInput) => Promise<ImportJob>
    getStatus: (id: string) => Promise<ImportJob | null>
    onUpdate: (listener: (job: ImportJob) => void) => () => void
  }
  lyrics: {
    getForTrack: (track: PlayerTrack) => Promise<LyricsState>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (settings: Partial<AppSettings>) => Promise<AppSettings>
    getVersion: () => Promise<string>
    getUpdateStatus: () => Promise<UpdateStatus>
    checkForUpdates: () => Promise<UpdateStatus>
    downloadUpdate: () => Promise<UpdateStatus>
    installUpdate: () => Promise<void>
    onUpdateStatusChange: (listener: (status: UpdateStatus) => void) => () => void
  }
}

export const ipcChannels = {
  windowMinimize: "window:minimize",
  windowMaximize: "window:maximize",
  windowUnmaximize: "window:unmaximize",
  windowClose: "window:close",
  windowIsMaximized: "window:is-maximized",
  windowMaximizedChanged: "window:maximized-changed",
  playerStateChanged: "player:state-changed",
  playerGetState: "player:get-state",
  playerPlay: "player:play",
  playerPause: "player:pause",
  playerResume: "player:resume",
  playerStop: "player:stop",
  playerSeek: "player:seek",
  playerSetVolume: "player:set-volume",
  playerSetRepeatMode: "player:set-repeat-mode",
  searchQuery: "search:query",
  resolverResolve: "resolver:resolve",
  resolverResolveCatalog: "resolver:resolve-catalog",
  queueChanged: "queue:changed",
  queueList: "queue:list",
  queueAdd: "queue:add",
  queueAddMany: "queue:add-many",
  queueRemove: "queue:remove",
  queueMove: "queue:move",
  queueShuffle: "queue:shuffle",
  queueClear: "queue:clear",
  playlistsList: "playlists:list",
  playlistsCreate: "playlists:create",
  playlistsRename: "playlists:rename",
  playlistsDelete: "playlists:delete",
  playlistsAddTrack: "playlists:add-track",
  playlistsRemoveTrack: "playlists:remove-track",
  playlistsMoveTrack: "playlists:move-track",
  tracksSetLiked: "tracks:set-liked",
  tracksSetCandidateLiked: "tracks:set-candidate-liked",
  downloadsChanged: "downloads:changed",
  downloadsDownloadTrack: "downloads:download-track",
  downloadsDownloadCandidate: "downloads:download-candidate",
  downloadsDownloadPlaylist: "downloads:download-playlist",
  downloadsRemoveTrack: "downloads:remove-track",
  importsStart: "imports:start",
  importsGetStatus: "imports:get-status",
  importsChanged: "imports:changed",
  lyricsGetForTrack: "lyrics:get-for-track",
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  settingsGetVersion: "settings:get-version",
  settingsGetUpdateStatus: "settings:get-update-status",
  settingsCheckForUpdates: "settings:check-for-updates",
  settingsDownloadUpdate: "settings:download-update",
  settingsInstallUpdate: "settings:install-update",
  settingsUpdateStatusChanged: "settings:update-status-changed",
} as const
