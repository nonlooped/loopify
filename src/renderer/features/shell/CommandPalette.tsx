import FocusTrap from "focus-trap-react"
import { Download, ExternalLink, Heart, Loader2, Play, Plus, Search, X } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { CatalogSearchResult, CatalogTrack, TrackCandidate } from "src/shared/types/music"
import { useDebouncedCallback } from "use-debounce"
import { useModalDismiss } from "@/hooks/useModalDismiss"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import { cn } from "@/lib/cn"
import { useAppStore } from "@/stores/app.store"
import { showContextMenu } from "@/stores/context-menu.store"

type SearchTab = "all" | "tracks" | "artists" | "albums"

function looksLikeUrl(text: string): boolean {
  try {
    const url = new URL(text.trim())
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

export function CommandPalette() {
  const isOpen = useAppStore((s) => s.isSearchOpen)
  const onClose = useCallback(() => useAppStore.getState().toggleSearch(false), [])
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<CatalogSearchResult[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<SearchTab>("all")
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(isOpen)
  const reducedMotion = usePrefersReducedMotion()

  // Reset state when closed (after unmount, so exit can show last content)
  useEffect(() => {
    if (shouldRender) return
    setQuery("")
    setResults([])
    setActiveIndex(-1)
    setIsLoading(false)
    setError(null)
    setResolvingId(null)
    setActiveTab("all")
  }, [shouldRender])

  const filteredResults = useMemo(() => {
    if (activeTab === "tracks") return results.filter((r) => r.kind === "track")
    if (activeTab === "artists") return results.filter((r) => r.kind === "artist")
    if (activeTab === "albums") return results.filter((r) => r.kind === "album")
    return results
  }, [results, activeTab])

  // Reset active index when filtered results change
  useEffect(() => {
    setActiveIndex(filteredResults.length > 0 ? 0 : -1)
  }, [filteredResults])

  // Scroll active item into view when keyboard navigation changes
  useLayoutEffect(() => {
    if (activeIndex < 0) return
    const container = resultsContainerRef.current
    if (!container) return
    const activeEl = container.querySelector<HTMLDivElement>("[data-active-item='true']")
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" })
    }
  }, [activeIndex, reducedMotion])

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  useModalDismiss(isOpen, onClose, backdropRef)

  const performSearch = useCallback(async (text: string) => {
    if (!text.trim()) {
      setResults([])
      setIsLoading(false)
      return
    }
    if (looksLikeUrl(text.trim())) {
      setResults([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const hits = await window.loopify.search.query({ text: text.trim() })
      setResults(hits)
    } catch (err) {
      console.error("Search failed:", err)
      setError(err instanceof Error ? err.message : "Search failed")
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const debouncedSearch = useDebouncedCallback((value: string) => {
    void performSearch(value)
  }, 350)

  const withResolution = useCallback(
    async (catalog: CatalogTrack, action: (candidate: TrackCandidate) => void) => {
      const id = `track:${catalog.catalogId}`
      setResolvingId(id)
      try {
        const candidate = await window.loopify.resolver.resolveCatalog(catalog)
        action(candidate)
      } catch (err) {
        console.error("Source resolution failed:", err)
        setError(
          err instanceof Error ? err.message : "Could not find an audio source for this track."
        )
      } finally {
        setResolvingId(null)
      }
    },
    []
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    debouncedSearch(value)
  }

  const [urlLoading, setUrlLoading] = useState<"play" | "enqueue" | null>(null)

  const handlePlayUrl = useCallback(
    async (playNow: boolean) => {
      const url = query.trim()
      if (!url) return
      setUrlLoading(playNow ? "play" : "enqueue")
      setError(null)
      try {
        await window.loopify.queue.add({ sourceUrl: url, playNow })
        if (playNow) onClose()
      } catch (err) {
        console.error("URL play failed:", err)
        setError(err instanceof Error ? err.message : "Could not play that URL.")
      } finally {
        setUrlLoading(null)
      }
    },
    [query, onClose]
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => (i < filteredResults.length - 1 ? i + 1 : i))
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => (i > 0 ? i - 1 : i))
      return
    }
    // Enter on a URL query: play it directly
    if (e.key === "Enter" && looksLikeUrl(query.trim())) {
      e.preventDefault()
      const playNow = !(e.metaKey || e.ctrlKey)
      void handlePlayUrl(playNow)
      return
    }
    if (e.key !== "Enter" || filteredResults.length === 0 || activeIndex < 0) return
    const selected = filteredResults[activeIndex]
    if (!selected) return
    if (selected.kind !== "track") return
    const track = selected.track
    if (resolvingId) return
    const mod = e.metaKey || e.ctrlKey
    if (mod) {
      e.preventDefault()
      void withResolution(track, (c) => {
        useAppStore.getState().handleEnqueueTrack(c)
      })
      return
    }
    e.preventDefault()
    void withResolution(track, (c) => {
      useAppStore.getState().handlePlayTrack(c)
      useAppStore.getState().toggleSearch(false)
    })
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
      className={`ol-backdrop fixed top-9 inset-x-0 bottom-0 z-100 flex items-start justify-center pt-32 bg-canvas/80 ${showOverlay ? "ol-open" : ""}`}
    >
      <FocusTrap active={showOverlay}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search"
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
          <div ref={resultsContainerRef} className="p-2 max-h-[60vh] overflow-y-auto">
            {/* Tab bar */}
            {query.trim() && !looksLikeUrl(query.trim()) && (
              <div className="flex gap-1 mb-2 px-1">
                {(["all", "tracks", "artists", "albums"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "type-label cursor-pointer rounded-lg px-3 py-1.5 transition-colors duration-ui ease-out-quart capitalize",
                      activeTab === tab
                        ? "bg-white/10 text-foreground"
                        : "text-muted hover:bg-white/5 hover:text-foreground"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <div className="px-4 py-6 text-center text-danger text-sm font-semibold">{error}</div>
            )}
            {!query.trim() && !isLoading && results.length === 0 && !error && (
              <div className="py-12 text-center flex flex-col items-center justify-center gap-2">
                <Search className="h-8 w-8 text-border" />
                <p className="type-body-sm text-muted">Start typing to search...</p>
                <p className="type-meta text-subtle">
                  Search for songs, artists, or albums — or paste a URL to play directly.
                </p>
              </div>
            )}
            {query.trim() && looksLikeUrl(query.trim()) && (
              <div
                className={cn("group flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white/5")}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-raised">
                  <ExternalLink className="h-5 w-5 text-muted" />
                </div>
                <div className="flex flex-1 flex-col min-w-0">
                  <span className="type-body-sm truncate text-foreground">Play URL</span>
                  <span className="type-meta truncate text-muted">{query.trim()}</span>
                </div>
                <div className="flex items-center gap-1">
                  {urlLoading ? (
                    <Loader2 className="h-5 w-5 text-muted animate-spin mx-1.5" />
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={!!urlLoading}
                        onClick={() => void handlePlayUrl(true)}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent hover:scale-105 active:scale-95 transition-transform duration-press ease-out-quart motion-reduce:hover:scale-100 motion-reduce:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Play now"
                        aria-label="Play URL"
                      >
                        <Play className="h-4 w-4 fill-current ml-0.5" />
                      </button>
                      <button
                        type="button"
                        disabled={!!urlLoading}
                        onClick={() => void handlePlayUrl(false)}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10 transition-colors duration-ui ease-out-quart disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Add to queue"
                        aria-label="Add URL to queue"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
            {query.trim() &&
              !looksLikeUrl(query.trim()) &&
              !isLoading &&
              filteredResults.length === 0 &&
              !error && (
                <div className="py-12 text-center flex flex-col items-center justify-center gap-2">
                  <Search className="h-8 w-8 text-border" />
                  <p className="type-body-sm text-muted">No results found</p>
                  <p className="type-meta text-subtle">
                    Try different words, an artist plus title, or paste a URL to play directly.
                  </p>
                </div>
              )}
            {filteredResults.map((result, index) => {
              if (result.kind === "track") {
                const hit = result.track
                const rowId = `track:${hit.catalogId}`
                const isResolving = resolvingId === rowId
                return (
                  <div
                    key={rowId}
                    role="option"
                    aria-selected={index === activeIndex || undefined}
                    tabIndex={-1}
                    data-active-item={index === activeIndex || undefined}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      showContextMenu(e, [
                        {
                          type: "item",
                          label: "Play",
                          icon: <Play className="h-4 w-4" />,
                          onSelect: () => {
                            void withResolution(hit, (c) => {
                              useAppStore.getState().handlePlayTrack(c)
                              useAppStore.getState().toggleSearch(false)
                            })
                          },
                        },
                        {
                          type: "item",
                          label: "Add to Queue",
                          icon: <Plus className="h-4 w-4" />,
                          onSelect: () => {
                            void withResolution(hit, (c) =>
                              useAppStore.getState().handleEnqueueTrack(c)
                            )
                          },
                        },
                        { type: "separator" },
                        {
                          type: "item",
                          label: "Like",
                          icon: <Heart className="h-4 w-4" />,
                          onSelect: () => {
                            void withResolution(hit, (c) =>
                              useAppStore.getState().handleLikeCandidate(c)
                            )
                          },
                        },
                        {
                          type: "item",
                          label: "Download",
                          icon: <Download className="h-4 w-4" />,
                          onSelect: () => {
                            void withResolution(hit, (c) =>
                              useAppStore.getState().handleDownloadCandidate(c)
                            )
                          },
                        },
                        { type: "separator" },
                        {
                          type: "item",
                          label: "Copy Title \u0026 Artist",
                          icon: <ExternalLink className="h-4 w-4" />,
                          onSelect: () => {
                            navigator.clipboard
                              .writeText([hit.title, hit.artist].filter(Boolean).join(" \u2014 "))
                              .catch(() => {})
                          },
                        },
                      ])
                    }}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-ui ease-out-quart",
                      index === activeIndex ? "bg-white/8" : "hover:bg-white/5"
                    )}
                  >
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-raised">
                      {hit.artworkUrl && (
                        <img
                          src={hit.artworkUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col min-w-0">
                      <span className="type-body-sm truncate text-foreground">{hit.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="type-meta truncate text-muted">{hit.artist}</span>
                        <span className="type-meta tabular-nums text-subtle">
                          {formatDuration(hit.durationMs)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-100 transition-opacity duration-ui ease-out-quart sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 motion-reduce:transition-none motion-reduce:opacity-100">
                      {isResolving ? (
                        <Loader2 className="h-5 w-5 text-muted animate-spin mx-1.5" />
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!!resolvingId}
                            onClick={() =>
                              void withResolution(hit, (c) => {
                                useAppStore.getState().handlePlayTrack(c)
                                useAppStore.getState().toggleSearch(false)
                              })
                            }
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-accent text-on-accent hover:scale-105 active:scale-95 transition-transform duration-press ease-out-quart motion-reduce:hover:scale-100 motion-reduce:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Play now"
                            aria-label={`Play ${hit.title}`}
                          >
                            <Play className="h-4 w-4 fill-current ml-0.5" />
                          </button>
                          <button
                            type="button"
                            disabled={!!resolvingId}
                            onClick={() =>
                              void withResolution(hit, (c) =>
                                useAppStore.getState().handleEnqueueTrack(c)
                              )
                            }
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10 transition-colors duration-ui ease-out-quart disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Add to queue"
                            aria-label={`Add ${hit.title} to queue`}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={!!resolvingId}
                            onClick={() =>
                              void withResolution(hit, (c) =>
                                useAppStore.getState().handleLikeCandidate(c)
                              )
                            }
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10 transition-colors duration-ui ease-out-quart disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Like song"
                            aria-label={`Like ${hit.title}`}
                          >
                            <Heart className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={!!resolvingId}
                            onClick={() =>
                              void withResolution(hit, (c) =>
                                useAppStore.getState().handleDownloadCandidate(c)
                              )
                            }
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10 transition-colors duration-ui ease-out-quart disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Download for offline playback"
                            aria-label={`Download ${hit.title}`}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              }

              if (result.kind === "artist") {
                const artist = result.artist
                const rowId = `artist:${artist.deezerId}`
                return (
                  <button
                    key={rowId}
                    type="button"
                    onClick={() => {
                      useAppStore
                        .getState()
                        .setLibraryView({ kind: "artist", deezerId: artist.deezerId })
                      useAppStore.getState().toggleSearch(false)
                    }}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 w-full text-left transition-colors duration-ui ease-out-quart",
                      index === activeIndex ? "bg-white/8" : "hover:bg-white/5"
                    )}
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-raised">
                      {artist.pictureUrl && (
                        <img
                          src={artist.pictureUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </div>
                    <span className="type-body-sm truncate text-foreground">{artist.name}</span>
                    <span className="type-meta ml-auto text-subtle">Artist</span>
                  </button>
                )
              }

              if (result.kind === "album") {
                const album = result.album
                const rowId = `album:${album.deezerId}`
                return (
                  <button
                    key={rowId}
                    type="button"
                    onClick={() => {
                      useAppStore
                        .getState()
                        .setLibraryView({ kind: "album", deezerId: album.deezerId })
                      useAppStore.getState().toggleSearch(false)
                    }}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 w-full text-left transition-colors duration-ui ease-out-quart",
                      index === activeIndex ? "bg-white/8" : "hover:bg-white/5"
                    )}
                  >
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-raised">
                      {album.coverUrl && (
                        <img
                          src={album.coverUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col min-w-0">
                      <span className="type-body-sm truncate text-foreground">{album.title}</span>
                      <span className="type-meta truncate text-muted">{album.artistName}</span>
                    </div>
                    <span className="type-meta text-subtle">Album</span>
                  </button>
                )
              }
              return null
            })}
          </div>
        </div>
      </FocusTrap>
    </div>
  )
}
