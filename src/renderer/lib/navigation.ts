import type { LibraryView } from "@/stores/app.store"

export function getBackLabel(view: LibraryView | null): string {
  if (!view) return "Back to Collection"
  switch (view.kind) {
    case "collection":
      return "Back to Collection"
    case "playlist":
      return "Back to Playlist"
    case "artist":
      return "Back to Artist"
    case "album":
      return "Back to Album"
    default:
      return "Back to Collection"
  }
}
