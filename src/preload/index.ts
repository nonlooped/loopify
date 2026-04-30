import { contextBridge, ipcRenderer } from "electron"
import { ipcChannels, type LoopifyApi, type UpdateStatus } from "../shared/contracts/ipc"
import type { ImportJob, PlayerState, QueueItem, Track } from "../shared/types/music"

const api: LoopifyApi = {
  window: {
    minimize: () => ipcRenderer.send(ipcChannels.windowMinimize),
    maximize: () => ipcRenderer.send(ipcChannels.windowMaximize),
    unmaximize: () => ipcRenderer.send(ipcChannels.windowUnmaximize),
    close: () => ipcRenderer.send(ipcChannels.windowClose),
    isMaximized: () => ipcRenderer.invoke(ipcChannels.windowIsMaximized),
    onMaximizedChange: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, maximized: boolean): void =>
        listener(maximized)
      ipcRenderer.on(ipcChannels.windowMaximizedChanged, wrapped)
      return () => ipcRenderer.off(ipcChannels.windowMaximizedChanged, wrapped)
    },
  },
  player: {
    getState: () => ipcRenderer.invoke(ipcChannels.playerGetState),
    play: (queueItemId) => ipcRenderer.invoke(ipcChannels.playerPlay, queueItemId),
    pause: () => ipcRenderer.invoke(ipcChannels.playerPause),
    resume: () => ipcRenderer.invoke(ipcChannels.playerResume),
    stop: () => ipcRenderer.invoke(ipcChannels.playerStop),
    seek: (seconds) => ipcRenderer.invoke(ipcChannels.playerSeek, seconds),
    setVolume: (volume) => ipcRenderer.invoke(ipcChannels.playerSetVolume, volume),
    setRepeatMode: (mode) => ipcRenderer.invoke(ipcChannels.playerSetRepeatMode, mode),
    onStateChange: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, state: PlayerState): void =>
        listener(state)
      ipcRenderer.on(ipcChannels.playerStateChanged, wrapped)
      return () => ipcRenderer.off(ipcChannels.playerStateChanged, wrapped)
    },
  },
  search: {
    query: (input) => ipcRenderer.invoke(ipcChannels.searchQuery, input),
    queryTracks: (q) => ipcRenderer.invoke(ipcChannels.searchQueryTracks, q),
    queryArtists: (q) => ipcRenderer.invoke(ipcChannels.searchQueryArtists, q),
    queryAlbums: (q) => ipcRenderer.invoke(ipcChannels.searchQueryAlbums, q),
  },
  catalog: {
    getArtist: (deezerId) => ipcRenderer.invoke(ipcChannels.catalogGetArtist, deezerId),
    getAlbum: (deezerId) => ipcRenderer.invoke(ipcChannels.catalogGetAlbum, deezerId),
    getTrackNavInfo: (trackId) => ipcRenderer.invoke(ipcChannels.catalogGetTrackNavInfo, trackId),
  },
  resolver: {
    resolve: (input) => ipcRenderer.invoke(ipcChannels.resolverResolve, input),
    resolveCatalog: (track) => ipcRenderer.invoke(ipcChannels.resolverResolveCatalog, track),
  },
  queue: {
    list: () => ipcRenderer.invoke(ipcChannels.queueList),
    add: (input) => ipcRenderer.invoke(ipcChannels.queueAdd, input),
    addMany: (input) => ipcRenderer.invoke(ipcChannels.queueAddMany, input),
    remove: (id) => ipcRenderer.invoke(ipcChannels.queueRemove, id),
    move: (id, sortOrder) => ipcRenderer.invoke(ipcChannels.queueMove, id, sortOrder),
    shuffle: () => ipcRenderer.invoke(ipcChannels.queueShuffle),
    clear: () => ipcRenderer.invoke(ipcChannels.queueClear),
    onChange: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, queue: QueueItem[]): void =>
        listener(queue)
      ipcRenderer.on(ipcChannels.queueChanged, wrapped)
      return () => ipcRenderer.off(ipcChannels.queueChanged, wrapped)
    },
  },
  playlists: {
    list: () => ipcRenderer.invoke(ipcChannels.playlistsList),
    create: (name) => ipcRenderer.invoke(ipcChannels.playlistsCreate, name),
    rename: (id, name) => ipcRenderer.invoke(ipcChannels.playlistsRename, id, name),
    delete: (id) => ipcRenderer.invoke(ipcChannels.playlistsDelete, id),
    addTrack: (playlistId, sourceUrl) =>
      ipcRenderer.invoke(ipcChannels.playlistsAddTrack, playlistId, sourceUrl),
    removeTrack: (playlistId, entryId) =>
      ipcRenderer.invoke(ipcChannels.playlistsRemoveTrack, playlistId, entryId),
    moveTrack: (playlistId, entryId, newIndex) =>
      ipcRenderer.invoke(ipcChannels.playlistsMoveTrack, playlistId, entryId, newIndex),
  },
  tracks: {
    setLiked: (trackId, liked) => ipcRenderer.invoke(ipcChannels.tracksSetLiked, trackId, liked),
    setCandidateLiked: (candidate, liked) =>
      ipcRenderer.invoke(ipcChannels.tracksSetCandidateLiked, candidate, liked),
  },
  downloads: {
    downloadTrack: (trackId) => ipcRenderer.invoke(ipcChannels.downloadsDownloadTrack, trackId),
    downloadCandidate: (candidate) =>
      ipcRenderer.invoke(ipcChannels.downloadsDownloadCandidate, candidate),
    downloadPlaylist: (playlistId) =>
      ipcRenderer.invoke(ipcChannels.downloadsDownloadPlaylist, playlistId),
    removeTrackDownload: (trackId) => ipcRenderer.invoke(ipcChannels.downloadsRemoveTrack, trackId),
    onChange: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, track: Track): void => listener(track)
      ipcRenderer.on(ipcChannels.downloadsChanged, wrapped)
      return () => ipcRenderer.off(ipcChannels.downloadsChanged, wrapped)
    },
  },
  imports: {
    start: (input) => ipcRenderer.invoke(ipcChannels.importsStart, input),
    getStatus: (id) => ipcRenderer.invoke(ipcChannels.importsGetStatus, id),
    onUpdate: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, job: ImportJob): void => listener(job)
      ipcRenderer.on(ipcChannels.importsChanged, wrapped)
      return () => ipcRenderer.off(ipcChannels.importsChanged, wrapped)
    },
  },
  lyrics: {
    getForTrack: (track) => ipcRenderer.invoke(ipcChannels.lyricsGetForTrack, track),
  },
  settings: {
    get: () => ipcRenderer.invoke(ipcChannels.settingsGet),
    update: (settings) => ipcRenderer.invoke(ipcChannels.settingsUpdate, settings),
    getVersion: () => ipcRenderer.invoke(ipcChannels.settingsGetVersion),
    getUpdateStatus: () => ipcRenderer.invoke(ipcChannels.settingsGetUpdateStatus),
    checkForUpdates: () => ipcRenderer.invoke(ipcChannels.settingsCheckForUpdates),
    downloadUpdate: () => ipcRenderer.invoke(ipcChannels.settingsDownloadUpdate),
    installUpdate: () => ipcRenderer.invoke(ipcChannels.settingsInstallUpdate),
    onUpdateStatusChange: (listener) => {
      const wrapped = (_event: Electron.IpcRendererEvent, status: UpdateStatus): void =>
        listener(status)
      ipcRenderer.on(ipcChannels.settingsUpdateStatusChanged, wrapped)
      return () => ipcRenderer.off(ipcChannels.settingsUpdateStatusChanged, wrapped)
    },
  },
}

contextBridge.exposeInMainWorld("loopify", api)
