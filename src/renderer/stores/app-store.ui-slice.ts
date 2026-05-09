import type { AppStoreSlice } from "./app-store.types"

export const createUiSlice: AppStoreSlice = (set, get) => ({
  setActionError: (err) => {
    set({ actionError: err })
  },

  clearActionError: () => {
    set({ actionError: null })
  },

  dismissUpdate: () => {
    const { updateStatus } = get()
    if (updateStatus) {
      set({ dismissedUpdatePhase: updateStatus.phase })
    }
  },

  handleClearQueueShortcut: async () => {
    const { queue, queueClearConfirming } = get()
    if (queue.length === 0) return
    if (!queueClearConfirming) {
      set({ queueClearConfirming: true })
      return
    }
    set({ queueClearConfirming: false })
    await get().queueOnClear()
  },

  setQueueClearConfirming: (v) => {
    set({ queueClearConfirming: v })
  },

  setIsCompactShell: (v) => {
    set({ isCompactShell: v })
  },

  toggleSearch: (open) => {
    set((state) => ({ isSearchOpen: open ?? !state.isSearchOpen }))
  },

  toggleSettings: (open) => {
    set((state) => ({ isSettingsOpen: open ?? !state.isSettingsOpen }))
  },

  toggleImport: (open) => {
    set((state) => ({ isImportOpen: open ?? !state.isImportOpen }))
  },

  toggleShortcuts: (open) => {
    set((state) => ({ isShortcutsOpen: open ?? !state.isShortcutsOpen }))
  },

  toggleQueue: (open) => {
    set((state) => ({ isQueueOpen: open ?? !state.isQueueOpen }))
  },

  toggleSidebar: (open) => {
    set((state) => ({ isSidebarExpanded: open ?? !state.isSidebarExpanded }))
  },

  setShellReveal: (v) => {
    set({ shellReveal: v })
  },

  setPlaylistAction: (s) => {
    set({ playlistAction: s })
  },
})
