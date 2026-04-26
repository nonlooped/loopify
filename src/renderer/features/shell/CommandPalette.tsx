import { Download, Heart, Loader2, Play, Plus, Search, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { TrackCandidate } from "src/shared/types/music"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { formatModShortcutTitle } from "@/lib/shortcut"

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onPlayTrack?: (track: TrackCandidate) => void
  onEnqueueTrack?: (track: TrackCandidate) => void
  onLikeTrack?: (track: TrackCandidate) => void
  onDownloadTrack?: (track: TrackCandidate) => void
}

export function CommandPalette({
  isOpen,
  onClose,
  onPlayTrack,
  onEnqueueTrack,
  onLikeTrack,
  onDownloadTrack,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<TrackCandidate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(isOpen)

  // Reset state when closed (after unmount, so exit can show last content)
  useEffect(() => {
    if (shouldRender) return
    setQuery("")
    setResults([])
    setIsLoading(false)
    setError(null)
  }, [shouldRender])

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Global ESC handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Backdrop click handler
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (e.target === backdropRef.current) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [isOpen, onClose])

  const performSearch = useCallback(async (text: string) => {
    if (!text.trim()) {
      setResults([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const candidates = await window.loopify.search.query({ text: text.trim() })
      setResults(candidates)
    } catch (err) {
      console.error("Search failed:", err)
      setError(err instanceof Error ? err.message : "Search failed")
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      void performSearch(value)
    }, 350)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || results.length === 0) return
    const mod = e.metaKey || e.ctrlKey
    if (mod) {
      if (onEnqueueTrack) {
        e.preventDefault()
        onEnqueueTrack(results[0])
        onClose()
      }
      return
    }
    if (onPlayTrack) {
      e.preventDefault()
      onPlayTrack(results[0])
      onClose()
    }
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return "--:--"
    const totalSeconds = Math.floor(ms / 1000)
    const m = Math.floor(totalSeconds / 60)
    const s = totalSeconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  if (!shouldRender) return null

  return (
    <div
      ref={backdropRef}
      onTransitionEnd={onBackdropTransitionEnd}
      className={`ol-backdrop fixed inset-0 z-100 flex items-start justify-center pt-32 bg-canvas/60 backdrop-blur-3xl ${showOverlay ? "ol-open" : ""}`}
    >
      <div
        className={`ol-palette-panel w-full max-w-2xl bg-surface rounded-2xl shadow-panel overflow-hidden flex flex-col ${showOverlay ? "ol-open" : ""}`}
      >
        <div className="flex items-center px-4 py-4 border-b border-border">
          <Search className="h-5 w-5 text-muted mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search tracks or paste a source URL..."
            className="type-title flex-1 bg-transparent text-foreground outline-none placeholder:text-subtle placeholder:font-normal"
          />
          {isLoading && <Loader2 className="h-5 w-5 text-muted animate-spin mr-2" />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            title="Close search"
            className="cursor-pointer p-1 rounded-md text-muted hover:bg-white/10 hover:text-foreground transition-colors duration-ui ease-out-quart"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-2 max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="px-4 py-6 text-center text-danger text-sm font-semibold">{error}</div>
          )}
          {!query.trim() && !isLoading && results.length === 0 && !error && (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-2">
              <Search className="h-8 w-8 text-border" />
              <p className="type-body-sm text-muted">Start typing to search...</p>
              <p className="type-meta text-subtle">
                Search playable sources. Enter plays the top result,{" "}
                {formatModShortcutTitle("Enter")} adds it to the queue.
              </p>
            </div>
          )}
          {query.trim() && !isLoading && results.length === 0 && !error && (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-2">
              <Search className="h-8 w-8 text-border" />
              <p className="type-body-sm text-muted">No results found</p>
              <p className="type-meta text-subtle">
                Try different words, an artist plus title, or paste a playlist URL in Import.
              </p>
            </div>
          )}
          {results.map((candidate) => (
            <div
              key={candidate.sourceUrl}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5 transition-colors duration-ui ease-out-quart"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-raised">
                {candidate.thumbnailUrl && (
                  <img
                    src={candidate.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col min-w-0">
                <span className="type-body-sm truncate text-foreground">{candidate.title}</span>
                <div className="flex items-center gap-2">
                  <span className="type-meta truncate text-muted">
                    {candidate.artist || "Unknown Artist"}
                  </span>
                  <span className="type-meta tabular-nums text-subtle">
                    {formatDuration(candidate.durationMs)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-100 transition-opacity duration-ui ease-out-quart sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none motion-reduce:opacity-100">
                {onPlayTrack && (
                  <button
                    type="button"
                    onClick={() => {
                      onPlayTrack(candidate)
                      onClose()
                    }}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent hover:scale-105 active:scale-95 transition-transform duration-press ease-out-quart motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                    title="Play now"
                    aria-label={`Play ${candidate.title}`}
                  >
                    <Play className="h-4 w-4 fill-current ml-0.5" />
                  </button>
                )}
                {onEnqueueTrack && (
                  <button
                    type="button"
                    onClick={() => onEnqueueTrack(candidate)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10 transition-colors duration-ui ease-out-quart"
                    title="Add to queue"
                    aria-label={`Add ${candidate.title} to queue`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
                {onLikeTrack && (
                  <button
                    type="button"
                    onClick={() => onLikeTrack(candidate)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10 transition-colors duration-ui ease-out-quart"
                    title="Like song"
                    aria-label={`Like ${candidate.title}`}
                  >
                    <Heart className="h-4 w-4" />
                  </button>
                )}
                {onDownloadTrack && (
                  <button
                    type="button"
                    onClick={() => onDownloadTrack(candidate)}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10 transition-colors duration-ui ease-out-quart"
                    title="Download for offline playback"
                    aria-label={`Download ${candidate.title}`}
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
