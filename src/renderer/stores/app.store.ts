import { create } from "zustand"
import { createBootSlice } from "./app-store.boot-slice"
import { createDataSlice } from "./app-store.data-slice"
import { createNavigationSlice } from "./app-store.navigation-slice"
import { createPlaybackSlice } from "./app-store.playback-slice"
import { createPlaylistsSlice } from "./app-store.playlists-slice"
import type { AppState, LibraryView } from "./app-store.types"
import { createUiSlice } from "./app-store.ui-slice"

export type { LibraryView }

const initialState = {
  bootPhase: "loading",
  bootError: null,
  playerState: null,
  playerPosition: null,
  playlists: [],
  queue: [],
  queueMap: new Map(),
  currentQueueItem: null,
  currentTrackIndex: -1,
  hasNext: false,
  hasPrevious: false,
  libraryView: { kind: "collection" },
  previousLibraryView: null,

  isSearchOpen: false,

  isSettingsOpen: false,
  isImportOpen: false,
  isShortcutsOpen: false,
  isQueueOpen: false,
  isSidebarExpanded: false,
  playlistAction: null,
  queueClearConfirming: false,

  updateStatus: null,
  recommendationsEnabled: false,
  homeRecommendations: null,
  discoverRecommendationSessionId: null,
  discoverRecommendationTrackIds: new Set<string>(),
  recommendationMetrics: null,
  dismissedUpdatePhase: null,
  actionError: null,
  shellReveal: false,
  isCompactShell: false,
  playlistShuffleIds: new Set(),

  lastPlayerState: null,
} satisfies Partial<AppState>

export const useAppStore = create<AppState>()(
  (set, get, store) =>
    ({
      ...initialState,
      ...createBootSlice(set, get, store),
      ...createDataSlice(set, get, store),
      ...createNavigationSlice(set, get, store),
      ...createPlaybackSlice(set, get, store),
      ...createPlaylistsSlice(set, get, store),
      ...createUiSlice(set, get, store),
    }) as AppState
)
