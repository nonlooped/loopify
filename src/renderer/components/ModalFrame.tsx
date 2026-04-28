import FocusTrap from "focus-trap-react"
import { X } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/cn"

interface ModalFrameProps {
  title: string
  description?: string
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: "sm" | "md" | "lg"
  bodyClassName?: string
  panelClassName?: string
  closeLabel?: string
  isOpen?: boolean
}

export function ModalFrame({
  title,
  description,
  icon,
  onClose,
  children,
  footer,
  size = "md",
  bodyClassName,
  panelClassName,
  closeLabel = "Close dialog",
  isOpen = true,
}: ModalFrameProps) {
  return (
    <FocusTrap active={isOpen}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "ol-panel mx-auto flex max-h-[min(92vh,58rem)] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-panel",
          isOpen && "ol-open",
          size === "sm" && "max-w-[min(28rem,100%)]",
          size === "md" && "max-w-[min(34rem,100%)]",
          size === "lg" && "max-w-[min(42rem,100%)]",
          panelClassName
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5 sm:px-8">
          <div className="min-w-0">
            <h2 className="type-heading m-0 flex items-center gap-2 text-foreground">
              {icon ? <span className="text-accent">{icon}</span> : null}
              <span>{title}</span>
            </h2>
            {description ? <p className="type-meta mt-2 text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            title={closeLabel}
            className="cursor-pointer rounded-md p-2 text-muted transition-colors duration-ui ease-out-quart hover:bg-white/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8", bodyClassName)}>
          {children}
        </div>

        {footer ? <div className="border-t border-border px-6 py-4 sm:px-8">{footer}</div> : null}
      </div>
    </FocusTrap>
  )
}
