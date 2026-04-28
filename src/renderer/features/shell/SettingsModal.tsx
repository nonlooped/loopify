import { Loader2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { UpdateStatus } from "src/shared/contracts/ipc"
import type { AppSettings } from "src/shared/types/music"
import { Button } from "@/components/Button"
import { TextField } from "@/components/TextField"
import { useFocusTrap } from "@/hooks/useFocusTrap"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { KEYBOARD_SHORTCUTS_HELP } from "@/lib/keyboard-shortcuts"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [version, setVersion] = useState<string>("")
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    "general" | "features" | "shortcuts" | "advanced" | "info"
  >("general")
  const backdropRef = useRef<HTMLDivElement>(null)
  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(isOpen)

  // Fetch settings and version when opened
  useEffect(() => {
    if (!isOpen) return
    void window.loopify.settings.get().then(setSettings).catch(console.error)
    void window.loopify.settings.getVersion().then(setVersion).catch(console.error)
    const unsubscribe = window.loopify.settings.onUpdateStatusChange(setUpdateStatus)
    void window.loopify.settings.getUpdateStatus().then(setUpdateStatus).catch(console.error)
    void window.loopify.settings.checkForUpdates().then(setUpdateStatus).catch(console.error)
    return unsubscribe
  }, [isOpen])

  useEffect(() => {
    if (shouldRender) return
    setSettings(null)
    setUpdateStatus(null)
    setSaveMessage(null)
    setIsInstallingUpdate(false)
    setActiveTab("general")
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

  const handleUpdateAction = async () => {
    if (!updateStatus) return

    try {
      if (updateStatus.phase === "available") {
        await window.loopify.settings.downloadUpdate()
        return
      }

      if (updateStatus.phase === "downloaded") {
        setIsInstallingUpdate(true)
        await window.loopify.settings.installUpdate()
        return
      }

      if (updateStatus.phase === "error" || updateStatus.phase === "up-to-date") {
        await window.loopify.settings.checkForUpdates()
      }
    } catch (err) {
      console.error("Failed to update Loopify:", err)
      setIsInstallingUpdate(false)
    }
  }

  const { containerRef: focusRef, handleKeyDown } = useFocusTrap(showOverlay)

  if (!shouldRender) return null

  return (
    <div
      ref={backdropRef}
      onTransitionEnd={onBackdropTransitionEnd}
      className={`ol-backdrop fixed top-9 inset-x-0 bottom-0 z-100 flex items-center justify-center bg-canvas/80 px-3 py-3 sm:px-4 sm:py-4 ${showOverlay ? "ol-open" : ""}`}
    >
      <div
        ref={focusRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onKeyDown={handleKeyDown}
        className={`ol-panel flex max-h-[min(92vh,58rem)] w-full max-w-[min(42rem,100%)] flex-col overflow-hidden rounded-2xl bg-surface shadow-panel ${showOverlay ? "ol-open" : ""}`}
      >
        {!settings ? (
          <div className="flex min-h-72 items-center justify-center px-6 py-12 sm:px-8">
            <Loader2 className="h-6 w-6 text-muted animate-spin" />
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between px-6 pt-5 sm:px-8">
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
              <div className="mt-4 flex gap-6 border-b border-border px-6 sm:px-8 overflow-x-auto no-scrollbar">
                {(["General", "Features", "Shortcuts", "Advanced", "Info"] as const).map((tab) => {
                  const id = tab.toLowerCase() as typeof activeTab
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`whitespace-nowrap border-b-2 px-1 pb-3 type-body-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                        activeTab === id
                          ? "border-accent text-foreground"
                          : "border-transparent text-muted hover:text-foreground hover:border-white/10"
                      }`}
                    >
                      {tab}
                    </button>
                  )
                })}
              </div>
            </div>

            <form onSubmit={handleSave} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 sm:px-10">
                {activeTab === "general" && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <section className="space-y-8">
                      <header>
                        <h3 className="type-title text-foreground">System & Playback</h3>
                        <p className="type-meta mt-1.5 text-muted max-w-2xl">
                          Local command-line tools for media resolution and playback. Leave these as
                          defaults unless the app cannot find them.
                        </p>
                      </header>
                      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="mpvPath"
                            className="type-label mb-2 block text-foreground"
                          >
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
                          <label
                            htmlFor="ytdlpPath"
                            className="type-label mb-2 block text-foreground"
                          >
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
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === "features" && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <section className="space-y-8">
                      <header>
                        <h3 className="type-title text-foreground">Features & Integrations</h3>
                        <p className="type-meta mt-1.5 text-muted max-w-2xl">
                          Optional capabilities to enhance your library and social experience.
                        </p>
                      </header>
                      <div className="flex flex-col">
                        <label className="group flex cursor-pointer items-start justify-between gap-6 border-b border-border/40 pb-6">
                          <div className="flex flex-col pr-8">
                            <span className="type-body font-medium text-foreground transition-colors group-hover:text-white">
                              Improve catalog metadata
                            </span>
                            <span className="type-meta mt-1 text-muted">
                              Fill in missing artwork, artist, and title details from public catalog
                              sources when matches are confident.
                            </span>
                          </div>
                          <div className="mt-1 shrink-0">
                            <input
                              type="checkbox"
                              name="metadataEnrichmentEnabled"
                              defaultChecked={settings.metadataEnrichmentEnabled}
                              className="h-5 w-5 rounded border-subtle bg-white/5 transition-colors checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                            />
                          </div>
                        </label>

                        <label className="group flex cursor-pointer items-start justify-between gap-6 pt-6">
                          <div className="flex flex-col pr-8">
                            <span className="type-body font-medium text-foreground transition-colors group-hover:text-white">
                              Share now playing to Discord
                            </span>
                            <span className="type-meta mt-1 text-muted">
                              Publish active playback to your Discord profile through Rich Presence
                              while Loopify is open.
                            </span>
                          </div>
                          <div className="mt-1 shrink-0">
                            <input
                              type="checkbox"
                              name="discordPresenceEnabled"
                              defaultChecked={settings.discordPresenceEnabled}
                              className="h-5 w-5 rounded border-subtle bg-white/5 transition-colors checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                            />
                          </div>
                        </label>
                      </div>
                    </section>
                  </div>
                )}

                {activeTab === "advanced" && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <section className="space-y-8">
                      <header>
                        <h3 className="type-title text-foreground">Advanced Configuration</h3>
                        <p className="type-meta mt-1.5 text-muted max-w-2xl">
                          Match scores run from 0 to 1. Higher values avoid bad matches but may skip
                          obscure tracks.
                        </p>
                      </header>

                      <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="resolverTimeoutMs"
                            className="type-label mb-2 block text-foreground"
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
                          <p className="type-meta mt-2 text-subtle">Milliseconds.</p>
                        </div>
                        <div>
                          <label
                            htmlFor="cacheTtlHours"
                            className="type-label mb-2 block text-foreground"
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
                          <p className="type-meta mt-2 text-subtle">Hours.</p>
                        </div>

                        <div>
                          <label
                            htmlFor="streamCacheTtlMinutes"
                            className="type-label mb-2 block text-foreground"
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
                          <p className="type-meta mt-2 text-subtle">Minutes.</p>
                        </div>
                        <div>
                          <label
                            htmlFor="importMaxTracks"
                            className="type-label mb-2 block text-foreground"
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

                        <div>
                          <label
                            htmlFor="importMatchConcurrency"
                            className="type-label mb-2 block text-foreground"
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
                            className="type-label mb-2 block text-foreground"
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

                        <div>
                          <label
                            htmlFor="spotifyMatchScoreThreshold"
                            className="type-label mb-2 block text-foreground"
                          >
                            Spotify match score
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
                            className="type-label mb-2 block text-foreground"
                          >
                            Catalog match score
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
                    </section>
                  </div>
                )}

                {activeTab === "shortcuts" && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <section className="space-y-8">
                      <header>
                        <h3 className="type-title text-foreground">Keyboard Shortcuts</h3>
                        <p className="type-meta mt-1.5 text-muted max-w-2xl">
                          Global and app-specific keybindings.
                        </p>
                      </header>
                      <ul className="m-0 list-none p-0">
                        {KEYBOARD_SHORTCUTS_HELP.map((row) => (
                          <li
                            key={`${row.action}-${row.keys}`}
                            className="flex items-center justify-between gap-4 border-b border-border/40 py-3.5 last:border-0"
                          >
                            <span className="type-body text-foreground">{row.action}</span>
                            <kbd className="shrink-0 rounded-md border border-border/60 bg-white/5 px-2.5 py-1 type-meta text-muted tabular-nums shadow-sm">
                              {row.keys}
                            </kbd>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>
                )}

                {activeTab === "info" && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <section className="flex flex-col items-center justify-center py-6 text-center">
                      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-accent/20 to-accent/5 ring-1 ring-accent/20 shadow-inner">
                        <img
                          src="/icon.png"
                          alt="Loopify Logo"
                          className="h-14 w-14 object-contain drop-shadow-md"
                        />
                      </div>
                      <h3 className="type-heading text-foreground mb-3">Loopify</h3>
                      <p className="type-meta text-muted mb-10 max-w-xs leading-relaxed">
                        A premium desktop music player built for aesthetics, performance, and local
                        libraries.
                      </p>

                      <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-border/50 bg-white/[0.02] p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="type-body font-medium text-foreground">Version</span>
                          <span className="type-body text-muted tabular-nums">{version}</span>
                        </div>
                        <div className="h-px w-full bg-border/40" />
                        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
                          <span className="type-meta text-subtle" aria-live="polite">
                            {updateStatus
                              ? formatUpdateStatus(updateStatus)
                              : "Checking for updates..."}
                          </span>
                          {renderUpdateButton(updateStatus, isInstallingUpdate, handleUpdateAction)}
                        </div>
                      </div>
                    </section>
                  </div>
                )}
              </div>

              <div className="border-t border-border bg-surface px-6 py-4 sm:px-8 shrink-0">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    {saveMessage && (
                      <p
                        className={`type-meta text-center animate-in fade-in slide-in-from-left-2 ${
                          saveMessage.includes("success") ? "text-accent" : "text-danger"
                        }`}
                      >
                        {saveMessage}
                      </p>
                    )}
                  </div>
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
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

function formatUpdateStatus(status: UpdateStatus): string {
  if (status.phase === "checking") return "Checking for updates"
  if (status.phase === "available" && status.availableVersion) {
    return `Version ${status.availableVersion} is available`
  }
  if (status.phase === "downloading") {
    const progress = status.progressPercent ?? 0
    return `Downloading version ${status.availableVersion ?? "update"}, ${progress}%`
  }
  if (status.phase === "downloaded" && status.availableVersion) {
    return `Version ${status.availableVersion} is ready to install`
  }
  if (status.phase === "up-to-date") return "You are up to date"
  if (status.phase === "unsupported") return status.message ?? "Updates are unavailable here"
  if (status.phase === "error") return status.message ?? "Update check failed"
  return ""
}

function renderUpdateButton(
  status: UpdateStatus | null,
  isInstallingUpdate: boolean,
  onClick: () => void
) {
  if (!status) return null

  if (status.phase === "available") {
    return (
      <Button type="button" variant="outline" size="lg" onClick={onClick}>
        Update to {status.availableVersion ?? "latest"}
      </Button>
    )
  }

  if (status.phase === "downloading") {
    return (
      <Button type="button" variant="outline" size="lg" disabled>
        <span className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Downloading {status.progressPercent ?? 0}%
        </span>
      </Button>
    )
  }

  if (status.phase === "downloaded") {
    return (
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onClick}
        disabled={isInstallingUpdate}
      >
        {isInstallingUpdate ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Restarting...
          </span>
        ) : (
          "Restart to Update"
        )}
      </Button>
    )
  }

  if (status.phase === "error") {
    return (
      <Button type="button" variant="ghost" size="lg" onClick={onClick}>
        Try Again
      </Button>
    )
  }

  return null
}
