import { flushSync } from "react-dom"
import type { AppStoreSlice, LibraryView } from "./app-store.types"

type ViewTransition = {
  finished: Promise<void>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void) => ViewTransition
}

export const createNavigationSlice: AppStoreSlice = (set, get) => ({
  setLibraryView: (view: LibraryView) => {
    set((state) => ({ previousLibraryView: state.libraryView, libraryView: view }))
  },

  goBack: () => {
    set((state) => {
      if (!state.previousLibraryView) {
        return { libraryView: { kind: "collection" }, previousLibraryView: null }
      }
      return { libraryView: state.previousLibraryView, previousLibraryView: null }
    })
  },

  selectPlaylistWithTransition: (id) => {
    const nextView: LibraryView = id ? { kind: "playlist", id } : { kind: "collection" }
    const root = document.documentElement
    const doc = document as DocumentWithViewTransition
    const { libraryView } = get()
    const currentKind = libraryView.kind
    const direction =
      nextView.kind === "collection"
        ? "back"
        : currentKind === "collection" || (libraryView.kind === "playlist" && libraryView.id !== id)
          ? "forward"
          : null

    if (!direction || typeof doc.startViewTransition !== "function") {
      set((state) => ({ previousLibraryView: state.libraryView, libraryView: nextView }))
      return
    }

    root.dataset.playlistNav = direction
    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        set((state) => ({ previousLibraryView: state.libraryView, libraryView: nextView }))
      })
    })

    void transition.finished.finally(() => {
      if (root.dataset.playlistNav === direction) {
        delete root.dataset.playlistNav
      }
    })
  },
})
