import { Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { AppSettings } from "src/shared/types/music"
import { Button } from "@/components/Button"
import { TextField } from "@/components/TextField"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { KEYBOARD_SHORTCUTS_HELP } from "@/lib/keyboard-shortcuts"

const APP_VERSION = "0.1.0"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(isOpen)

  // Fetch settings when opened
  useEffect(() => {
    if (!isOpen) return
    void window.loopify.settings.get().then(setSettings).catch(console.error)
  }, [isOpen])

  useEffect(() => {
    if (shouldRender) return
    setSettings(null)
    setSaveMessage(null)
    setShowAdvanced(false)
    setShowShortcuts(false)
  }, [shouldRender])

  useEffect(() => {
    if (!isOpen || !settings) return
    const t = window.setTimeout(() => {
      document.getElementById("mpvPath")?.focus()
    }, 50)
    return () => window.clearTimeout(t)
  }, [isOpen, settings])

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

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!settings) return

    const formData = new FormData(e.currentTarget)
    const n = (k: string, fallback: number) => {
      const raw = formData.get(k)
      if (raw == null || raw === "") return fallback
      const v = Number(raw)
      return Number.isFinite(v) ? v : fallback
    }
    const patch: Partial<AppSettings> = {
      mpvPath: (formData.get("mpvPath") as string) || settings.mpvPath,
      ytdlpPath: (formData.get("ytdlpPath") as string) || settings.ytdlpPath,
      resolverTimeoutMs: n("resolverTimeoutMs", settings.resolverTimeoutMs),
      cacheTtlHours: n("cacheTtlHours", settings.cacheTtlHours),
      streamCacheTtlMinutes: n("streamCacheTtlMinutes", settings.streamCacheTtlMinutes),
      importMaxTracks: n("importMaxTracks", settings.importMaxTracks),
      importMatchConcurrency: n("importMatchConcurrency", settings.importMatchConcurrency),
      spotifyMatchScoreThreshold: n(
        "spotifyMatchScoreThreshold",
        settings.spotifyMatchScoreThreshold
      ),
      metadataEnrichmentEnabled: formData.get("metadataEnrichmentEnabled") === "on",
      metadataMinScore: n("metadataMinScore", settings.metadataMinScore),
      importProgressThrottle: n("importProgressThrottle", settings.importProgressThrottle),
      discordPresenceEnabled: formData.get("discordPresenceEnabled") === "on",
      communityLyricsFallbackEnabled: formData.get("communityLyricsFallbackEnabled") === "on",
    }

    setIsSaving(true)
    setSaveMessage(null)
    try {
      const updated = await window.loopify.settings.update(patch)
      setSettings(updated)
      setSaveMessage("Settings saved successfully")
      setTimeout(() => setSaveMessage(null), 2000)
    } catch (err) {
      console.error("Failed to save settings:", err)
      setSaveMessage("Failed to save settings")
    } finally {
      setIsSaving(false)
    }
  }

  if (!shouldRender) return null

  return (
    <div
      ref={backdropRef}
      onTransitionEnd={onBackdropTransitionEnd}
      className={`ol-backdrop fixed inset-0 z-100 flex items-center justify-center bg-canvas/80 px-3 py-3 backdrop-blur-md sm:px-4 sm:py-4 ${showOverlay ? "ol-open" : ""}`}
    >
      <div
        className={`ol-panel flex max-h-[min(92vh,58rem)] w-full max-w-[min(42rem,100%)] flex-col overflow-hidden rounded-2xl bg-surface shadow-panel ${showOverlay ? "ol-open" : ""}`}
      >
        {!settings ? (
          <div className="flex min-h-72 items-center justify-center px-6 py-12 sm:px-8">
            <Loader2 className="h-6 w-6 text-muted animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-6 py-5 sm:px-8">
              <h2 className="type-heading text-foreground">Settings</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close settings"
                title="Close settings"
                className="cursor-pointer rounded-md p-2 text-muted transition-colors duration-ui ease-out-quart hover:bg-white/10 hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
                <section className="space-y-4">
                  <div>
                    <p className="type-title m-0 text-foreground">Playback tools</p>
                    <p className="type-meta mt-1 text-muted">
                      Loopify uses local command-line tools for resolving and playback. Leave these
                      as defaults unless the app cannot find them.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="mpvPath" className="type-label mb-2 block text-subtle">
                      MPV path
                    </label>
                    <TextField
                      id="mpvPath"
                      name="mpvPath"
                      defaultValue={settings.mpvPath}
                      placeholder="/usr/bin/mpv"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label htmlFor="ytdlpPath" className="type-label mb-2 block text-subtle">
                      yt-dlp path
                    </label>
                    <TextField
                      id="ytdlpPath"
                      name="ytdlpPath"
                      defaultValue={settings.ytdlpPath}
                      placeholder="/usr/bin/yt-dlp"
                      className="h-11"
                    />
                  </div>
                </section>

                <section className="rounded-xl border border-border bg-white/3 p-4">
                  <label className="type-body-sm flex cursor-pointer items-start gap-3 text-foreground">
                    <span className="mt-0.5">
                      <input
                        type="checkbox"
                        name="metadataEnrichmentEnabled"
                        defaultChecked={settings.metadataEnrichmentEnabled}
                        className="h-4 w-4 rounded border-subtle"
                      />
                    </span>
                    <span>
                      <span className="block">Improve catalog metadata</span>
                      <span className="type-meta mt-1 block text-muted">
                        Fill in missing artwork, artist, and title details from public catalog
                        sources when matches are confident.
                      </span>
                    </span>
                  </label>
                </section>

                <section className="rounded-xl border border-border bg-white/3 p-4">
                  <label className="type-body-sm flex cursor-pointer items-start gap-3 text-foreground">
                    <span className="mt-0.5">
                      <input
                        type="checkbox"
                        name="discordPresenceEnabled"
                        defaultChecked={settings.discordPresenceEnabled}
                        className="h-4 w-4 rounded border-subtle"
                      />
                    </span>
                    <span>
                      <span className="block">Share now playing to Discord</span>
                      <span className="type-meta mt-1 block text-muted">
                        Publish active playback to your Discord profile through Rich Presence while
                        Loopify is open.
                      </span>
                    </span>
                  </label>
                </section>

                <section className="rounded-xl border border-border bg-white/3 p-4">
                  <label className="type-body-sm flex cursor-pointer items-start gap-3 text-foreground">
                    <span className="mt-0.5">
                      <input
                        type="checkbox"
                        name="communityLyricsFallbackEnabled"
                        defaultChecked={settings.communityLyricsFallbackEnabled}
                        className="h-4 w-4 rounded border-subtle"
                      />
                    </span>
                    <span>
                      <span className="block">Use community lyrics fallback</span>
                      <span className="type-meta mt-1 block text-muted">
                        When Loopify cannot find lyrics through LRCLIB, try an unofficial hosted
                        service as a last resort. This is disabled by default and may be slower,
                        less accurate, or unavailable.
                      </span>
                    </span>
                  </label>
                </section>

                <section className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="cursor-pointer flex w-full items-center justify-between rounded-xl border border-border bg-white/3 px-4 py-3 text-left transition-colors duration-ui ease-out-quart hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-expanded={showAdvanced}
                  >
                    <span>
                      <span className="type-body-sm block text-foreground">Advanced import</span>
                      <span className="type-meta mt-1 block text-muted">
                        Limits, cache timing, and match thresholds.
                      </span>
                    </span>
                    <span className="type-meta text-subtle">{showAdvanced ? "Hide" : "Show"}</span>
                  </button>

                  {showAdvanced && (
                    <div className="space-y-4 rounded-xl border border-border bg-canvas/35 p-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="resolverTimeoutMs"
                            className="type-label mb-2 block text-subtle"
                          >
                            Resolver timeout
                          </label>
                          <TextField
                            id="resolverTimeoutMs"
                            name="resolverTimeoutMs"
                            type="number"
                            defaultValue={settings.resolverTimeoutMs}
                            min={1000}
                            step={1000}
                            className="h-11"
                          />
                          <p className="type-meta mt-1 text-subtle">Milliseconds.</p>
                        </div>
                        <div>
                          <label
                            htmlFor="cacheTtlHours"
                            className="type-label mb-2 block text-subtle"
                          >
                            Metadata cache
                          </label>
                          <TextField
                            id="cacheTtlHours"
                            name="cacheTtlHours"
                            type="number"
                            defaultValue={settings.cacheTtlHours}
                            min={1}
                            className="h-11"
                          />
                          <p className="type-meta mt-1 text-subtle">Hours.</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="streamCacheTtlMinutes"
                            className="type-label mb-2 block text-subtle"
                          >
                            Stream cache
                          </label>
                          <TextField
                            id="streamCacheTtlMinutes"
                            name="streamCacheTtlMinutes"
                            type="number"
                            defaultValue={settings.streamCacheTtlMinutes}
                            min={5}
                            className="h-11"
                          />
                          <p className="type-meta mt-1 text-subtle">Minutes.</p>
                        </div>
                        <div>
                          <label
                            htmlFor="importMaxTracks"
                            className="type-label mb-2 block text-subtle"
                          >
                            Max tracks
                          </label>
                          <TextField
                            id="importMaxTracks"
                            name="importMaxTracks"
                            type="number"
                            defaultValue={settings.importMaxTracks}
                            min={1}
                            max={500}
                            className="h-11"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="importMatchConcurrency"
                            className="type-label mb-2 block text-subtle"
                          >
                            Import concurrency
                          </label>
                          <TextField
                            id="importMatchConcurrency"
                            name="importMatchConcurrency"
                            type="number"
                            defaultValue={settings.importMatchConcurrency}
                            min={1}
                            max={16}
                            className="h-11"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="importProgressThrottle"
                            className="type-label mb-2 block text-subtle"
                          >
                            Progress cadence
                          </label>
                          <TextField
                            id="importProgressThrottle"
                            name="importProgressThrottle"
                            type="number"
                            defaultValue={settings.importProgressThrottle}
                            min={1}
                            className="h-11"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="spotifyMatchScoreThreshold"
                            className="type-label mb-2 block text-subtle"
                          >
                            Spotify match
                          </label>
                          <TextField
                            id="spotifyMatchScoreThreshold"
                            name="spotifyMatchScoreThreshold"
                            type="number"
                            defaultValue={settings.spotifyMatchScoreThreshold}
                            min={0}
                            max={1}
                            step={0.01}
                            className="h-11"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="metadataMinScore"
                            className="type-label mb-2 block text-subtle"
                          >
                            Catalog match
                          </label>
                          <TextField
                            id="metadataMinScore"
                            name="metadataMinScore"
                            type="number"
                            defaultValue={settings.metadataMinScore}
                            min={0}
                            max={1}
                            step={0.01}
                            className="h-11"
                          />
                        </div>
                      </div>
                      <p className="type-meta m-0 text-muted">
                        Match scores run from 0 to 1. Higher values avoid bad matches but may skip
                        obscure tracks.
                      </p>
                    </div>
                  )}
                </section>

                <section className="border-t border-border pt-6">
                  <button
                    type="button"
                    onClick={() => setShowShortcuts((v) => !v)}
                    className="cursor-pointer flex w-full items-center justify-between rounded-xl px-1 py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    aria-expanded={showShortcuts}
                  >
                    <span className="type-label text-subtle">Keyboard shortcuts</span>
                    <span className="type-meta text-subtle">{showShortcuts ? "Hide" : "Show"}</span>
                  </button>
                  {showShortcuts && (
                    <ul className="m-0 mt-3 max-h-64 list-none space-y-2 overflow-y-auto p-0 pr-1">
                      {KEYBOARD_SHORTCUTS_HELP.map((row) => (
                        <li
                          key={`${row.action}-${row.keys}`}
                          className="type-meta flex justify-between gap-4"
                        >
                          <span className="min-w-0 text-muted">{row.action}</span>
                          <span className="shrink-0 text-right text-foreground tabular-nums">
                            {row.keys}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              <div className="border-t border-border px-6 py-4 sm:px-8">
                <div className="flex items-center justify-between">
                  <span className="type-meta text-muted">Loopify v{APP_VERSION}</span>
                  <div className="flex items-center gap-3">
                    <Button type="submit" size="lg" disabled={isSaving}>
                      {isSaving ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </span>
                      ) : (
                        "Save Changes"
                      )}
                    </Button>
                  </div>
                </div>
                {saveMessage && (
                  <p
                    className={`type-meta mt-3 text-center ${
                      saveMessage.includes("success") ? "text-accent" : "text-danger"
                    }`}
                  >
                    {saveMessage}
                  </p>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
