import type { DownloadStatus } from "src/shared/types/music"

export function formatTrackDuration(ms: number | null): string {
  if (!ms) return "--:--"
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function formatTotalDuration(ms: number): string {
  if (ms <= 0) return "0 min"
  const totalMinutes = Math.round(ms / 60000)
  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`
}

export function formatPlaylistMeta(trackCount: number, totalDurationMs: number): string {
  const trackLabel = `${trackCount} ${trackCount === 1 ? "track" : "tracks"}`
  return totalDurationMs > 0
    ? `${trackLabel} - ${formatTotalDuration(totalDurationMs)}`
    : trackLabel
}

export function downloadTitle(status: DownloadStatus, progress: number): string {
  if (status === "downloaded") return "Downloaded. Remove local file"
  if (status === "downloading") return `Downloading ${progress}%`
  if (status === "queued") return "Download queued"
  if (status === "failed") return "Download failed. Retry"
  return "Download for offline playback"
}
