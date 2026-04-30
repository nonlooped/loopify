import { useEffect, useRef } from "react"
import { formatModShortcut, isMacLike } from "@/lib/shortcut"

const VOLUME_STEP = 5
const SEEK_FINE = 5
const SEEK_COARSE = 30
export const NEAR_END_OFFSET_SEC = 3

function mod(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey
}

function isTypableTarget(eventTarget: EventTarget | null): boolean {
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

function isRangeSliderTarget(eventTarget: EventTarget | null): boolean {
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

type KeyContext = {
  typable: boolean
  inOff: boolean
  onRange: boolean
  modOnly: boolean
  hasMod: boolean
}

function handleMediaKeys(e: KeyboardEvent, d: AppKeyboardShortcutDeps): boolean | undefined {
  if (isMediaPlayPauseKey(e)) {
    d.onPlayPause()
    return true
  }
  if (isMediaNextKey(e) && d.hasNext) {
    d.onNext()
    return true
  }
  if (isMediaPreviousKey(e) && d.hasPrevious) {
    d.onPrevious()
    return true
  }
  if (isMediaStopKey(e)) {
    d.onStop()
    return true
  }
  return undefined
}

function handleGlobalShortcuts(
  e: KeyboardEvent,
  ctx: KeyContext,
  d: AppKeyboardShortcutDeps
): boolean | undefined {
  if (!ctx.modOnly) return undefined
  const key = e.key.toLowerCase()
  if (key === "k") {
    d.onOpenSearch()
    return true
  }
  if (e.key === ",") {
    if (!d.isSettingsOpen) d.onOpenSettings()
    return true
  }
  if (key === "i" && e.shiftKey) {
    if (!d.isImportOpen) d.onOpenImport()
    return true
  }
  if (key === "l") {
    d.onToggleQueue()
    return true
  }
  if (key === "b") {
    d.onToggleSidebar()
    return true
  }
  if (key === "n" && e.shiftKey) {
    if (!d.playlistActionOpen) d.onNewPlaylist()
    return true
  }
  if (key === "h" && e.shiftKey) {
    if (d.canShuffleQueue) d.onShuffleQueue()
    return true
  }
  if (key === "x" && e.shiftKey) {
    d.onStop()
    return true
  }
  if (e.shiftKey && (e.key === "Backspace" || e.key === "Delete")) {
    d.onClearQueue()
    return true
  }
  return undefined
}

function handleNavigationKeys(
  e: KeyboardEvent,
  ctx: KeyContext,
  d: AppKeyboardShortcutDeps
): boolean | undefined {
  if (ctx.modOnly && e.key === "ArrowLeft") {
    if (d.hasPrevious) d.onPrevious()
    return true
  }
  if (ctx.modOnly && e.key === "ArrowRight") {
    if (d.hasNext) d.onNext()
    return true
  }
  if (ctx.hasMod && !e.shiftKey && e.key === "ArrowUp") {
    d.onVolumeDelta(VOLUME_STEP)
    return true
  }
  if (ctx.hasMod && !e.shiftKey && e.key === "ArrowDown") {
    d.onVolumeDelta(-VOLUME_STEP)
    return true
  }
  if (
    ctx.onRange &&
    (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End")
  ) {
    return false
  }
  if (!ctx.hasMod && e.key === "ArrowLeft") {
    d.onSeekRelative(e.shiftKey ? -SEEK_COARSE : -SEEK_FINE)
    return true
  }
  if (!ctx.hasMod && e.key === "ArrowRight") {
    d.onSeekRelative(e.shiftKey ? SEEK_COARSE : SEEK_FINE)
    return true
  }
  if (e.key === "Home") {
    d.onSeekToStart()
    return true
  }
  if (e.key === "End") {
    d.onSeekNearEnd()
    return true
  }
  return undefined
}

function handleAppKeyDown(e: KeyboardEvent, d: AppKeyboardShortcutDeps): boolean {
  const ctx: KeyContext = {
    typable: isTypableTarget(e.target),
    inOff: insideShortcutsOffSubtrees(e.target),
    onRange: isRangeSliderTarget(e.target),
    modOnly: mod(e) && !e.altKey,
    hasMod: mod(e),
  }

  const stop = (): boolean => {
    e.preventDefault()
    e.stopPropagation()
    return true
  }

  if ((e.key === " " || e.code === "Space") && !e.repeat && !ctx.typable) {
    d.onPlayPause()
    return stop()
  }

  const mediaResult = handleMediaKeys(e, d)
  if (mediaResult != null) return stop()

  if (ctx.inOff) {
    if (e.key.toLowerCase() === "k" && ctx.modOnly) {
      d.onOpenSearch()
      return stop()
    }
    return false
  }

  const globalResult = handleGlobalShortcuts(e, ctx, d)
  if (globalResult != null) return stop()

  if (ctx.typable) return false

  const navResult = handleNavigationKeys(e, ctx, d)
  if (navResult === false) return false
  if (navResult === true) return stop()

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
