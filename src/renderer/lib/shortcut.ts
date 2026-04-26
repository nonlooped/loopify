/** True for macOS and iOS-style platforms (use Cmd in UI). */
export function isMacLike(): boolean {
  if (typeof navigator === "undefined") return false
  if (/Mac|iPhone|iPod|iPad/i.test(navigator.platform)) return true
  return /\bMac OS X\b/.test(navigator.userAgent)
}

/** Shown inline in the nav, e.g. `Cmd+K` or `Ctrl+K`. */
export function formatModShortcut(key: string): string {
  return isMacLike() ? `Cmd+${key}` : `Ctrl+${key}`
}

/** For `title` and accessible strings, e.g. `Cmd+K` or `Ctrl+K`. */
export function formatModShortcutTitle(key: string): string {
  return isMacLike() ? `Cmd+${key}` : `Ctrl+${key}`
}

/** Sentence for empty states (search palette). */
export function searchShortcutProse(): string {
  return isMacLike() ? "Open search (Cmd+K)." : "Open search (Ctrl+K)."
}
