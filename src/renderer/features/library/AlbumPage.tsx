import { Download, Heart, Loader2, Play, Plus } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import type { AlbumDetails, CatalogTrack, TrackCandidate } from "src/shared/types/music"
import { formatTrackDuration } from "@/lib/music-format"
import { useAppStore } from "@/stores/app.store"

export function AlbumPage({ deezerId }: { deezerId: number }) {
  const [data, setData] = useState<AlbumDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const setLibraryView = useAppStore((s) => s.setLibraryView)

  useEffect(() => {
    let cancelled = false
    window.loopify.catalog
      .getAlbum(deezerId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load album")
      })
    return () => {
      cancelled = true
    }
  }, [deezerId])

  const withResolution = useCallback(
    async (catalog: CatalogTrack, action: (candidate: TrackCandidate) => void) => {
      const id = `track:${catalog.catalogId}`
      setResolvingId(id)
      try {
        const candidate = await window.loopify.resolver.resolveCatalog(catalog)
        action(candidate)
      } catch (err) {
        console.error("Source resolution failed:", err)
      } finally {
        setResolvingId(null)
      }
    },
    []
  )

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <p className="type-body text-danger">{error}</p>
        <button
          type="button"
          onClick={() => setLibraryView({ kind: "collection" })}
          className="type-label mt-4 cursor-pointer text-muted hover:text-foreground"
        >
          ← Back to Collection
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 text-muted animate-spin" />
      </div>
    )
  }

  const { album, tracks } = data

  const playAll = () => {
    // Limit concurrent resolutions to avoid overwhelming yt-dlp
    const limit = 4
    const toResolve = tracks.slice(0, 50)
    let i = 0
    const next = () => {
      if (i >= toResolve.length) return
      const track = toResolve[i++]
      void withResolution(track, (c) => useAppStore.getState().handleEnqueueTrack(c)).finally(next)
    }
    // Start 'limit' concurrent workers
    for (let n = 0; n < Math.min(limit, toResolve.length); n++) next()
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-10 pb-10 sm:px-8 sm:pt-12 sm:pb-12">
      <button
        type="button"
        onClick={() => setLibraryView({ kind: "collection" })}
        className="cursor-pointer type-label text-muted transition-colors hover:text-foreground"
      >
        ← Back to Collection
      </button>

      <div className="mt-6 flex items-end gap-6 sm:mt-8 sm:flex-row sm:gap-8">
        <div className="h-40 w-40 shrink-0 overflow-hidden rounded-2xl bg-raised shadow-xl sm:h-48 sm:w-48 lg:h-56 lg:w-56">
          {album.coverUrl && (
            <img
              src={album.coverUrl}
              alt={album.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="type-display mb-3 text-foreground sm:mb-4 sm:text-[3.25rem] md:text-[3.75rem] lg:text-[4.5rem]">
            {album.title}
          </h1>
          <p className="type-label mb-6 text-accent">
            {album.artistName} · {album.trackCount} tracks
          </p>
          <button
            type="button"
            onClick={playAll}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-6 text-on-accent type-label cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-press"
          >
            <Play className="h-4 w-4 fill-current" />
            Play All
          </button>
        </div>
      </div>

      <section className="mt-10">
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {tracks.map((track, i) => {
            const isResolving = resolvingId === `track:${track.catalogId}`
            return (
              <li
                key={track.catalogId}
                className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/5"
              >
                <span className="type-body-sm w-8 text-center tabular-nums text-muted">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="type-body-sm truncate text-foreground">{track.title}</span>
                  <span className="type-meta truncate text-muted">{track.artist}</span>
                </div>
                <span className="type-body-sm shrink-0 tabular-nums text-subtle">
                  {formatTrackDuration(track.durationMs)}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isResolving ? (
                    <Loader2 className="h-5 w-5 text-muted animate-spin" />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          void withResolution(track, (c) =>
                            useAppStore.getState().handlePlayTrack(c)
                          )
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-on-accent"
                      >
                        <Play className="h-3 w-3 fill-current ml-0.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void withResolution(track, (c) =>
                            useAppStore.getState().handleEnqueueTrack(c)
                          )
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void withResolution(track, (c) =>
                            useAppStore.getState().handleLikeCandidate(c)
                          )
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10"
                      >
                        <Heart className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void withResolution(track, (c) =>
                            useAppStore.getState().handleDownloadCandidate(c)
                          )
                        }
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-white/10"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
