import { Download, Heart, Loader2, Play, Plus } from "lucide-react"
import { useEffect, useState } from "react"
import type { ArtistDiscography, CatalogAlbum } from "src/shared/types/music"
import { Button } from "@/components/Button"
import { EmptyState } from "@/components/EmptyState"
import { IconButton } from "@/components/IconButton"
import { useResolver } from "@/hooks/useResolver"
import { buildAlbumContextMenu, buildCatalogTrackContextMenu } from "@/lib/context-menu-items"
import { formatTrackDuration } from "@/lib/music-format"
import { getBackLabel } from "@/lib/navigation"
import { navigateFromTrack } from "@/lib/track-nav"
import { useAppStore } from "@/stores/app.store"
import { showContextMenu } from "@/stores/context-menu.store"

export function ArtistPage({ deezerId }: { deezerId: number }) {
  const [data, setData] = useState<ArtistDiscography | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { resolvingId, resolve } = useResolver()
  const setLibraryView = useAppStore((s) => s.setLibraryView)
  const previousLibraryView = useAppStore((s) => s.previousLibraryView)
  const goBack = useAppStore((s) => s.goBack)

  useEffect(() => {
    let cancelled = false
    window.loopify.catalog
      .getArtist(deezerId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load artist")
      })
    return () => {
      cancelled = true
    }
  }, [deezerId])

  if (error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <EmptyState
          density="compact"
          title="Could not load artist"
          description={error}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => setLibraryView({ kind: "collection" })}
            >
              Back to Collection
            </Button>
          }
        />
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

  const { artist, topTracks, albums, singles, compilations } = data

  const playAll = () => {
    const limit = 4
    const toResolve = topTracks.slice(0, 25)
    let i = 0
    const next = () => {
      if (i >= toResolve.length) return
      const track = toResolve[i++]
      void resolve(track)
        .then((c) => {
          if (c) useAppStore.getState().handleEnqueueTrack(c)
        })
        .finally(next)
    }
    for (let n = 0; n < Math.min(limit, toResolve.length); n++) next()
  }

  const hasAnyContent =
    topTracks.length > 0 || albums.length > 0 || singles.length > 0 || compilations.length > 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-10 pb-10 sm:px-8 sm:pt-12 sm:pb-12">
      <button
        type="button"
        onClick={goBack}
        className="cursor-pointer type-label text-muted transition-colors duration-ui ease-out-quart hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {getBackLabel(previousLibraryView)}
      </button>

      <div className="mt-6 flex items-end gap-6 sm:mt-8">
        {artist.pictureUrl && (
          <img
            src={artist.pictureUrl}
            alt={artist.name}
            className="h-40 w-40 shrink-0 rounded-full object-cover shadow-xl sm:h-48 sm:w-48"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="type-display mb-3 text-foreground sm:text-[3.25rem] md:text-[3.75rem] lg:text-[4.5rem]">
            {artist.name}
          </h1>
          <Button
            type="button"
            size="lg"
            className="gap-2 rounded-full"
            onClick={playAll}
            disabled={topTracks.length === 0}
          >
            <Play className="h-4 w-4 fill-current" />
            Play All
          </Button>
        </div>
      </div>

      {topTracks.length > 0 && (
        <section className="mt-10">
          <h2 className="type-title mb-4 text-foreground">Top Tracks</h2>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {topTracks.slice(0, 20).map((track, i) => {
              const isResolving = resolvingId === `track:${track.catalogId}`
              return (
                <li
                  key={track.catalogId}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-ui ease-out-quart hover:bg-white/5"
                  onContextMenu={(e) => {
                    e.preventDefault()
                    showContextMenu(e, buildCatalogTrackContextMenu(track))
                  }}
                >
                  <span className="type-body-sm w-8 text-center tabular-nums text-muted">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void navigateFromTrack(track)
                      }}
                      className="type-body-sm block w-full truncate text-left text-foreground cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      {track.title}
                    </button>
                    <span className="type-meta truncate text-muted">
                      {track.features.length > 0
                        ? `feat. ${track.features.join(", ")} · ${formatTrackDuration(track.durationMs)}`
                        : formatTrackDuration(track.durationMs)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity duration-ui ease-out-quart group-hover:opacity-100">
                    {isResolving ? (
                      <Loader2 className="h-5 w-5 text-muted animate-spin" />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            void resolve(track).then((c) => {
                              if (c) useAppStore.getState().handlePlayTrack(c)
                            })
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-accent text-on-accent transition-[colors,transform] duration-ui ease-out-quart hover:bg-accent-bright active:scale-[0.95] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:active:scale-100"
                          aria-label={`Play ${track.title}`}
                        >
                          <Play className="h-3 w-3 fill-current ml-0.5" />
                        </button>
                        <IconButton
                          type="button"
                          size="sm"
                          title={`Add ${track.title} to queue`}
                          aria-label={`Add ${track.title} to queue`}
                          onClick={() =>
                            void resolve(track).then((c) => {
                              if (c) useAppStore.getState().handleEnqueueTrack(c)
                            })
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </IconButton>
                        <IconButton
                          type="button"
                          size="sm"
                          title={`Like ${track.title}`}
                          aria-label={`Like ${track.title}`}
                          onClick={() =>
                            void resolve(track).then((c) => {
                              if (c) useAppStore.getState().handleLikeCandidate(c)
                            })
                          }
                        >
                          <Heart className="h-3 w-3" />
                        </IconButton>
                        <IconButton
                          type="button"
                          size="sm"
                          title={`Download ${track.title}`}
                          aria-label={`Download ${track.title}`}
                          onClick={() =>
                            void resolve(track).then((c) => {
                              if (c) useAppStore.getState().handleDownloadCandidate(c)
                            })
                          }
                        >
                          <Download className="h-3 w-3" />
                        </IconButton>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {albums.length > 0 && <AlbumSection title="Albums" albums={albums} />}
      {singles.length > 0 && <AlbumSection title="Singles & EPs" albums={singles} />}
      {compilations.length > 0 && <AlbumSection title="Compilations" albums={compilations} />}

      {!hasAnyContent && (
        <EmptyState
          className="mx-auto mt-10 max-w-2xl"
          density="compact"
          title="No releases found"
          description="This artist does not have any tracks or albums available at the moment."
        />
      )}
    </div>
  )
}

function AlbumSection({ title, albums }: { title: string; albums: CatalogAlbum[] }) {
  const setLibraryView = useAppStore((s) => s.setLibraryView)
  return (
    <section className="mt-10">
      <h2 className="type-title mb-4 text-foreground">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 md:grid-cols-4 lg:grid-cols-5">
        {albums.map((album) => (
          <div key={album.deezerId} className="group relative text-left">
            <button
              type="button"
              onClick={() => setLibraryView({ kind: "album", deezerId: album.deezerId })}
              onContextMenu={(e) => {
                e.preventDefault()
                showContextMenu(e, buildAlbumContextMenu(album))
              }}
              className="absolute inset-0 z-[1] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={`Open ${album.title}`}
            />
            <div className="aspect-square overflow-hidden rounded-xl bg-raised shadow-md transition-transform duration-ui ease-out-quart group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
              {album.coverUrl && (
                <img
                  src={album.coverUrl}
                  alt={album.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <p className="type-body-sm mt-2 truncate text-foreground">{album.title}</p>
            <p className="type-meta truncate text-muted">{album.artistName}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
