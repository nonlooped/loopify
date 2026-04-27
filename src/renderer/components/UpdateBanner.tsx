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
        "fixed bottom-4 right-4 z-200 flex w-[22rem] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border border-border bg-raised px-4 py-3 shadow-panel backdrop-blur-3xl transition-[opacity,transform] duration-modal ease-out-quart motion-reduce:transition-none",
        showOverlay ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mt-0.5 shrink-0">
        {isDownloading ? (
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        ) : (
          <RotateCcw className="h-5 w-5 text-accent" />
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
      <div className="flex shrink-0 items-center gap-1">
        {status?.phase !== "downloading" && (
          <button
            type="button"
            onClick={handleAction}
            className="type-body-sm cursor-pointer rounded-lg bg-accent px-3 py-2 font-medium text-white transition-colors duration-ui ease-out-quart hover:bg-accent/90"
          >
            {status?.phase === "available" ? (
              <span className="flex items-center gap-1.5">
                <Download className="h-4 w-4" />
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
          className="cursor-pointer rounded-md p-2 text-muted transition-colors duration-ui ease-out-quart hover:text-foreground"
          aria-label="Dismiss update notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
