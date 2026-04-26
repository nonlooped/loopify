import { useEffect, useRef } from "react"
import { formatModShortcut, isMacLike } from "@/lib/shortcut"

const VOLUME_STEP = 5
const SEEK_FINE = 5
const SEEK_COARSE = 30
export const NEAR_END_OFFSET_SEC = 3

function mod(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey
}

/**
 * True when the user is typing in a field where Space/arrows/letters are meaningful.
 * Cmd/Ctrl+chords may still be handled separately by callers.
 */
export function isTypableTarget(eventTarget: EventTarget | null): boolean {
  if (!eventTarget || !(eventTarget instanceof Element)) return false
  if (eventTarget.closest('[data-loopify-shortcuts="off"]')) {
    return true
  }
  const el = eventTarget
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLSelectElement) return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  if (el.getAttribute("role") === "textbox") return true
  if (el instanceof HTMLInputElement) {
    const t = el.type
    if (t === "button" || t === "submit" || t === "reset" || t === "range" || t === "image") {
      return false
    }
    if (t === "checkbox" || t === "radio" || t === "file" || t === "color" || t === "hidden") {
      return false
    }
    return true
  }
  return false
}

export function isRangeSliderTarget(eventTarget: EventTarget | null): boolean {
  return eventTarget instanceof HTMLInputElement && eventTarget.type === "range"
}

function isMediaPlayPauseKey(e: KeyboardEvent): boolean {
  return e.code === "MediaPlayPause" || e.key === "MediaPlayPause"
}

function isMediaNextKey(e: KeyboardEvent): boolean {
  return e.code === "MediaTrackNext" || e.key === "MediaTrackNext"
}

function isMediaPreviousKey(e: KeyboardEvent): boolean {
  return e.code === "MediaTrackPrevious" || e.key === "MediaTrackPrevious"
}

function isMediaStopKey(e: KeyboardEvent): boolean {
  return e.code === "MediaStop" || e.key === "MediaStop"
}

function insideShortcutsOffSubtrees(eventTarget: EventTarget | null): boolean {
  if (!(eventTarget instanceof Element)) return false
  return !!eventTarget.closest('[data-loopify-shortcuts="off"]')
}

export type AppKeyboardShortcutDeps = {
  onOpenSearch: () => void
  onOpenSettings: () => void
  onOpenImport: () => void
  onToggleQueue: () => void
  onToggleSidebar: () => void
  onNewPlaylist: () => void
  onPlayPause: () => void
  onNext: () => void
  onPrevious: () => void
  onStop: () => void
  onSeekRelative: (delta: number) => void
  onSeekToStart: () => void
  onSeekNearEnd: () => void
  onVolumeDelta: (delta: number) => void
  onShuffleQueue: () => void
  onClearQueue: () => void
  isSearchOpen: boolean
  isSettingsOpen: boolean
  isImportOpen: boolean
  playlistActionOpen: boolean
  canShuffleQueue: boolean
  hasNext: boolean
  hasPrevious: boolean
}

/**
 * Return true if the app handled the key (caller should not run other handlers for the same key).
 */
export function handleAppKeyDown(e: KeyboardEvent, d: AppKeyboardShortcutDeps): boolean {
  const target = e.target
  const inOff = insideShortcutsOffSubtrees(target)
  const typable = isTypableTarget(target)
  const onRange = isRangeSliderTarget(target)
  const modOnly = mod(e) && !e.altKey

  const stop = (): boolean => {
    e.preventDefault()
    e.stopPropagation()
    return true
  }

  // Space toggles playback only when focus is outside editable fields.
  if ((e.key === " " || e.code === "Space") && !e.repeat && !typable) {
    d.onPlayPause()
    return stop()
  }

  // Media keys work even in typable/off contexts, except range owns bare arrows.
  if (isMediaPlayPauseKey(e)) {
    d.onPlayPause()
    return stop()
  }
  if (isMediaNextKey(e) && d.hasNext) {
    d.onNext()
    return stop()
  }
  if (isMediaPreviousKey(e) && d.hasPrevious) {
    d.onPrevious()
    return stop()
  }
  if (isMediaStopKey(e)) {
    d.onStop()
    return stop()
  }

  if (inOff) {
    if (e.key.toLowerCase() === "k" && modOnly) {
      d.onOpenSearch()
      return stop()
    }
    return false
  }

  // Global shell shortcuts are allowed from typable fields except where noted.
  if (e.key.toLowerCase() === "k" && modOnly) {
    d.onOpenSearch()
    return stop()
  }
  if (e.key === "," && modOnly) {
    if (!d.isSettingsOpen) {
      d.onOpenSettings()
    }
    return stop()
  }
  if (e.key.toLowerCase() === "i" && e.shiftKey && modOnly) {
    if (!d.isImportOpen) {
      d.onOpenImport()
    }
    return stop()
  }
  if (e.key.toLowerCase() === "l" && modOnly) {
    d.onToggleQueue()
    return stop()
  }
  if (e.key.toLowerCase() === "b" && modOnly) {
    d.onToggleSidebar()
    return stop()
  }
  if (e.key.toLowerCase() === "n" && e.shiftKey && modOnly) {
    if (!d.playlistActionOpen) {
      d.onNewPlaylist()
    }
    return stop()
  }
  if (e.key.toLowerCase() === "h" && e.shiftKey && modOnly) {
    if (d.canShuffleQueue) {
      d.onShuffleQueue()
    }
    return stop()
  }
  if (e.key.toLowerCase() === "x" && e.shiftKey && modOnly) {
    d.onStop()
    return stop()
  }
  if (e.shiftKey && modOnly) {
    if (e.key === "Backspace" || e.key === "Delete") {
      d.onClearQueue()
      return stop()
    }
  }

  // From here: avoid hijacking line/word navigation in text fields.
  if (typable) {
    return false
  }

  if (e.key === "ArrowLeft" && mod(e)) {
    if (d.hasPrevious) {
      d.onPrevious()
    }
    return stop()
  }
  if (e.key === "ArrowRight" && mod(e)) {
    if (d.hasNext) {
      d.onNext()
    }
    return stop()
  }

  if (e.key === "ArrowUp" && mod(e) && !e.shiftKey) {
    d.onVolumeDelta(VOLUME_STEP)
    return stop()
  }
  if (e.key === "ArrowDown" && mod(e) && !e.shiftKey) {
    d.onVolumeDelta(-VOLUME_STEP)
    return stop()
  }

  if (
    onRange &&
    (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End")
  ) {
    return false
  }

  if (e.key === "ArrowLeft" && !mod(e)) {
    const delta = e.shiftKey ? -SEEK_COARSE : -SEEK_FINE
    d.onSeekRelative(delta)
    return stop()
  }
  if (e.key === "ArrowRight" && !mod(e)) {
    const delta = e.shiftKey ? SEEK_COARSE : SEEK_FINE
    d.onSeekRelative(delta)
    return stop()
  }
  if (e.key === "Home") {
    d.onSeekToStart()
    return stop()
  }
  if (e.key === "End") {
    d.onSeekNearEnd()
    return stop()
  }

  return false
}

export function useAppKeyboardShortcuts(deps: AppKeyboardShortcutDeps) {
  const ref = useRef(deps)
  ref.current = deps
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      void handleAppKeyDown(e, ref.current)
    }
    window.addEventListener("keydown", onKeyDown, true)
    return () => window.removeEventListener("keydown", onKeyDown, true)
  }, [])
}

const mac = isMacLike()
const modLabel = mac ? "⌘" : "Ctrl+"
const sh = mac ? "⌘⇧" : "Ctrl+Shift+"

export const KEYBOARD_SHORTCUTS_HELP: { action: string; keys: string }[] = [
  { action: "Search", keys: formatModShortcut("K") },
  { action: "Play / pause", keys: "Space · media play/pause" },
  {
    action: "Next / previous track",
    keys: mac ? "⌘→ / ⌘← · media next/prev" : "Ctrl+Right / Left · media next/prev",
  },
  { action: "Stop", keys: `${sh}X · media stop` },
  { action: "Seek back / forward 5s", keys: "← / →" },
  { action: "Seek back / forward 30s", keys: "Shift+← / →" },
  { action: "Jump to start / near end of track", keys: "Home / End" },
  { action: "Volume down / up", keys: mac ? "⌘↓ / ⌘↑" : "Ctrl+Down / Up" },
  { action: "Toggle queue", keys: formatModShortcut("L") },
  { action: "Shuffle queue", keys: `${sh}H` },
  { action: "Clear queue", keys: `${sh}${mac ? "Backspace" : "Backspace/Delete"}` },
  { action: "Settings", keys: formatModShortcut(",") },
  { action: "Import", keys: `${sh}I` },
  { action: "New playlist", keys: `${sh}N` },
  { action: "Toggle sidebar", keys: formatModShortcut("B") },
  { action: "Play first search result", keys: "Enter" },
  { action: "Enqueue first search result", keys: `${modLabel}Enter` },
]

export function playPauseHint(): string {
  return "Space or media key"
}

export function modArrowHint(arrow: "left" | "right"): string {
  if (isMacLike()) {
    return arrow === "left" ? "Cmd+Left" : "Cmd+Right"
  }
  return arrow === "left" ? "Ctrl+Left" : "Ctrl+Right"
}
