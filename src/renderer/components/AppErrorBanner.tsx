import { useLayoutEffect, useState } from "react"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { cn } from "@/lib/cn"

interface AppErrorBannerProps {
  message: string | null
  onDismiss: () => void
}

export function AppErrorBanner({ message, onDismiss }: AppErrorBannerProps) {
  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(!!message)
  const [hold, setHold] = useState<string | null>(null)

  useLayoutEffect(() => {
    if (message) setHold(message)
  }, [message])

  useLayoutEffect(() => {
    if (!shouldRender) setHold(null)
  }, [shouldRender])

  const onBannerTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    onBackdropTransitionEnd(e)
  }

  if (!message && !hold && !shouldRender) return null
  const text = message ?? hold ?? ""

  return (
    <div
      role="alert"
      onTransitionEnd={onBannerTransitionEnd}
      className={cn(
        "ol-error-banner type-body-sm pointer-events-auto fixed top-4 left-1/2 z-200 flex max-w-md -translate-x-1/2 items-start gap-3 rounded-xl border border-border bg-raised px-4 py-3 text-foreground shadow-panel backdrop-blur-3xl",
        showOverlay && "ol-open"
      )}
    >
      <p className="min-w-0 flex-1 break-words leading-snug">{text}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="type-meta cursor-pointer shrink-0 rounded-md px-2 py-1 text-muted transition-colors duration-ui ease-out-quart hover:text-foreground"
      >
        Dismiss
      </button>
    </div>
  )
}
