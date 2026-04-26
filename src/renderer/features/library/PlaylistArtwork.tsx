import { Disc3, HardDrive, Heart } from "lucide-react"
import type { Track } from "src/shared/types/music"
import { LIKED_SONGS_PLAYLIST_ID, OFFLINE_SONGS_PLAYLIST_ID } from "src/shared/types/music"
import { cn } from "@/lib/cn"

function TrackTile({ thumbnailUrl }: { thumbnailUrl: string | null }) {
  if (thumbnailUrl) {
    return (
      <img
        src={thumbnailUrl}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-raised">
      <Disc3 className="h-[40%] w-[40%] text-muted opacity-35" />
    </div>
  )
}

function SystemPlaylistMark({
  kind,
  className,
  transitionName,
  scrim,
}: {
  kind: "liked" | "offline"
  className?: string
  transitionName?: string
  scrim?: "bottom" | "top"
}) {
  return (
    <div
      className={cn("relative h-full w-full overflow-hidden", className)}
      style={transitionName ? { viewTransitionName: transitionName } : undefined}
    >
      {kind === "liked" ? (
        <div
          className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_32%_28%,oklch(0.7_0.2_20_/_0.55),transparent_50%),radial-gradient(circle_at_78%_80%,oklch(0.4_0.12_15_/_0.45),transparent_45%),linear-gradient(155deg,oklch(0.2_0.05_20),oklch(0.1_0.04_8))]"
          aria-hidden
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_30%_32%,oklch(0.6_0.12_250_/_0.45),transparent_50%),radial-gradient(circle_at_72%_70%,oklch(0.5_0.1_195_/_0.35),transparent_48%),linear-gradient(150deg,oklch(0.18_0.04_255),oklch(0.1_0.04_255))]"
          aria-hidden
        />
      )}
      <div
        className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center p-[18%] text-white/90 drop-shadow-lg"
        aria-hidden
      >
        {kind === "liked" ? (
          <Heart
            className="h-full w-full max-h-[64%] max-w-[64%] fill-rose-300/95 stroke-rose-950/20"
            strokeWidth={1.25}
          />
        ) : (
          <HardDrive className="h-full w-full max-h-[68%] max-w-[68%] stroke-2 text-sky-200/90" />
        )}
      </div>
      {scrim === "bottom" ? (
        <div
          className="pointer-events-none absolute inset-0 z-[2] bg-linear-to-t from-surface via-surface/35 to-transparent"
          aria-hidden
        />
      ) : scrim === "top" ? (
        <div
          className="pointer-events-none absolute inset-0 z-[2] bg-linear-to-b from-black/80 via-black/35 to-transparent"
          aria-hidden
        />
      ) : null}
    </div>
  )
}

type PlaylistArtworkProps = {
  tracks: Track[] | undefined
  /** System playlists use fixed art (Liked / Offline) instead of a collage of track art. */
  playlistId?: string
  className?: string
  transitionName?: string
  /**
   * Gradient scrim for text over artwork: `bottom` uses surface tones; `top` uses a dark vignette
   * for light text overlaid at the top of the tile.
   */
  scrim?: "bottom" | "top"
}

export function PlaylistArtwork({
  tracks,
  playlistId,
  className,
  transitionName,
  scrim,
}: PlaylistArtworkProps) {
  if (playlistId === LIKED_SONGS_PLAYLIST_ID) {
    return (
      <SystemPlaylistMark
        kind="liked"
        className={className}
        transitionName={transitionName}
        scrim={scrim}
      />
    )
  }
  if (playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
    return (
      <SystemPlaylistMark
        kind="offline"
        className={className}
        transitionName={transitionName}
        scrim={scrim}
      />
    )
  }

  const first = tracks?.slice(0, 4) ?? []
  const count = first.length

  if (count === 0) {
    return (
      <div
        className={cn("flex h-full w-full items-center justify-center bg-surface", className)}
        style={transitionName ? { viewTransitionName: transitionName } : undefined}
      >
        <Disc3 className="h-[45%] w-[45%] text-muted opacity-20" />
      </div>
    )
  }

  return (
    <div
      className={cn("relative h-full w-full overflow-hidden bg-raised", className)}
      style={transitionName ? { viewTransitionName: transitionName } : undefined}
    >
      {count === 1 && <TrackTile thumbnailUrl={first[0].thumbnailUrl} />}
      {count === 2 && (
        <div className="grid h-full w-full grid-cols-2">
          <TrackTile thumbnailUrl={first[0].thumbnailUrl} />
          <TrackTile thumbnailUrl={first[1].thumbnailUrl} />
        </div>
      )}
      {count === 3 && (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2">
          <TrackTile thumbnailUrl={first[0].thumbnailUrl} />
          <TrackTile thumbnailUrl={first[1].thumbnailUrl} />
          <TrackTile thumbnailUrl={first[2].thumbnailUrl} />
          <div className="bg-surface/70" aria-hidden />
        </div>
      )}
      {count >= 4 && (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2">
          {first.map((t) => (
            <TrackTile key={t.id} thumbnailUrl={t.thumbnailUrl} />
          ))}
        </div>
      )}
      {scrim === "bottom" ? (
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-surface via-surface/35 to-transparent"
          aria-hidden
        />
      ) : scrim === "top" ? (
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-black/80 via-black/35 to-transparent"
          aria-hidden
        />
      ) : null}
    </div>
  )
}
