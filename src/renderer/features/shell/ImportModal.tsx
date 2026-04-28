import { HardDriveDownload, Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/Button"
import { ModalFrame } from "@/components/ModalFrame"
import { TextField } from "@/components/TextField"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { useAppStore } from "@/stores/app.store"
import type { ImportJob } from "../../../shared/types/music"

export function ImportModal() {
  const isOpen = useAppStore((s) => s.isImportOpen)
  const onClose = useCallback(() => useAppStore.getState().toggleImport(false), [])
  const onImportComplete = useCallback(() => useAppStore.getState().refreshPlaylists(), [])
  const [url, setUrl] = useState("")
  const [isStarting, setIsStarting] = useState(false)
  const [activeJob, setActiveJob] = useState<ImportJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const completedRef = useRef(false)
  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(isOpen)

  // Reset state after overlay unmounts (not when isOpen flips, so exit animation keeps content)
  useEffect(() => {
    if (shouldRender) return
    setUrl("")
    setError(null)
    setIsStarting(false)
    setActiveJob(null)
    completedRef.current = false
    unlistenRef.current?.()
    unlistenRef.current = null
  }, [shouldRender])

  // Subscribe to import progress
  useEffect(() => {
    if (!isOpen) return
    unlistenRef.current = window.loopify.imports.onUpdate((job) => {
      setActiveJob((prev) => (prev == null || job.id === prev.id ? job : prev))
    })
    return () => {
      unlistenRef.current?.()
      unlistenRef.current = null
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

  const importInFlight =
    isStarting ||
    (activeJob != null && activeJob.status !== "done" && activeJob.status !== "failed")
  const isRunning = activeJob?.status === "running"

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim() || isStarting) return

    setIsStarting(true)
    setError(null)
    setActiveJob(null)
    try {
      const job = await window.loopify.imports.start({
        url: url.trim(),
        targetPlaylistId: null,
      })
      setActiveJob(job)
      if (job.status === "done" || job.status === "failed") {
        onImportComplete()
        onClose()
        return
      }
    } catch (err) {
      console.error("Import failed:", err)
      setError(err instanceof Error ? err.message : "Failed to start import")
    } finally {
      setIsStarting(false)
    }
  }

  useEffect(() => {
    if (!activeJob || completedRef.current) return
    if (activeJob.status === "done" && activeJob.finishedAt) {
      completedRef.current = true
      onImportComplete()
      onClose()
      return
    }
    if (activeJob.status === "failed" && activeJob.finishedAt) {
      completedRef.current = true
      setError(activeJob.errorMessage ?? "Import failed")
    }
  }, [activeJob, onImportComplete, onClose])

  if (!shouldRender) return null

  return (
    <div
      ref={backdropRef}
      onTransitionEnd={onBackdropTransitionEnd}
      className={`ol-backdrop fixed top-9 inset-x-0 bottom-0 z-100 flex items-center justify-center bg-canvas/80 ${showOverlay ? "ol-open" : ""}`}
    >
      <div>
        <ModalFrame
          title="Import media"
          description="Paste a YouTube or public Spotify playlist URL to add tracks to your library."
          icon={<HardDriveDownload className="h-5 w-5" />}
          onClose={onClose}
          size="md"
          closeLabel="Close import"
          isOpen={showOverlay}
          panelClassName="mx-3 sm:mx-4"
        >
          <form onSubmit={handleImport} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="import-url" className="type-label text-subtle">
                Playlist URL
              </label>
              <TextField
                id="import-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://...playlist…"
                autoFocus
                className="type-body h-12"
                disabled={importInFlight}
              />
            </div>

            {activeJob && isRunning && (
              <div className="rounded-xl border border-border bg-canvas/50 p-3 text-sm space-y-2">
                <p className="type-meta text-subtle">
                  {activeJob.phase} {activeJob.sourceKind ? `· ${activeJob.sourceKind}` : ""}
                </p>
                {activeJob.sourceKind === "spotify" && activeJob.phase === "matching" && (
                  <p className="text-foreground">
                    Matched {activeJob.matched} · Skipped {activeJob.skipped}
                    {activeJob.total > 0 ? ` · ${activeJob.completed} / ${activeJob.total}` : ""}
                  </p>
                )}
                {activeJob.phase === "saving" && (
                  <p className="text-foreground">
                    Saving {activeJob.completed} / {activeJob.total}
                  </p>
                )}
                {activeJob.truncated && (
                  <p className="type-meta text-foreground">
                    Playlist was truncated to max import size.
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm font-semibold text-danger text-center">{error}</p>}

            <Button
              size="lg"
              type="submit"
              className="w-full mt-2"
              disabled={importInFlight || !url.trim()}
            >
              {isStarting || isRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isStarting ? "Starting..." : "Importing..."}
                </span>
              ) : (
                "Start import"
              )}
            </Button>
            <p className="type-meta text-center text-subtle">
              YouTube playlist links with `list=` and public Spotify playlists are supported.
            </p>
          </form>
        </ModalFrame>
      </div>
    </div>
  )
}
