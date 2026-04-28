import { Download, Loader2, RotateCcw, X } from "lucide-react"
import type { UpdateStatus } from "src/shared/contracts/ipc"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { cn } from "@/lib/cn"

interface UpdateBannerProps {
  status: UpdateStatus | null
  onDismiss: () => void
}

export function UpdateBanner({ status, onDismiss }: UpdateBannerProps) {
  const visible =
    status?.phase === "available" ||
    status?.phase === "downloading" ||
    status?.phase === "downloaded"
  const { shouldRender, showOverlay } = useOverlayPresence(visible)

  const handleAction = async () => {
    if (status?.phase === "available") {
      await window.loopify.settings.downloadUpdate()
    } else if (status?.phase === "downloaded") {
      await window.loopify.settings.installUpdate()
    }
  }

  if (!shouldRender) return null

  const isDownloading = status?.phase === "downloading"
  const progress = status?.progressPercent ?? 0

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-200 flex w-[24rem] max-w-[calc(100vw-3rem)] items-center gap-3.5 rounded-2xl border border-border bg-surface p-3 pr-2 shadow-island transition-[opacity,transform] duration-modal ease-out-quart motion-reduce:transition-none",
        showOverlay ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 pointer-events-none"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex shrink-0 items-center justify-center rounded-xl bg-white/5 p-2.5 shadow-sm ring-1 ring-inset ring-white/10">
        {isDownloading ? (
          <Loader2 className="h-5 w-5 animate-spin text-foreground" />
        ) : (
          <RotateCcw className="h-5 w-5 text-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="type-body-sm font-medium text-foreground">
          {status?.phase === "available" &&
            `Loopify v${status.availableVersion ?? "update"} is available`}
          {isDownloading && `Downloading v${status.availableVersion ?? "update"}… ${progress}%`}
          {status?.phase === "downloaded" &&
            `Loopify v${status.availableVersion ?? "update"} is ready`}
        </p>
        <p className="type-meta mt-0.5 text-subtle">
          {status?.phase === "available" &&
            "Download the update to get the latest features and fixes."}
          {isDownloading && "This may take a moment depending on your connection."}
          {status?.phase === "downloaded" && "Restart the app to finish installing the update."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 ml-1">
        {status?.phase !== "downloading" && (
          <button
            type="button"
            onClick={handleAction}
            className="type-body-sm cursor-pointer rounded-full bg-accent px-3.5 py-1.5 font-medium text-on-accent transition duration-ui ease-out-quart hover:bg-accent-bright hover:shadow-md active:scale-95"
          >
            {status?.phase === "available" ? (
              <span className="flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download
              </span>
            ) : (
              "Restart"
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onDismiss}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted transition-colors duration-ui ease-out-quart hover:bg-white/10 hover:text-foreground active:scale-95"
          aria-label="Dismiss update notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
