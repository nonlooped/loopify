import { X } from "lucide-react"
import { useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import { IconButton } from "@/components/IconButton"
import { useModalDismiss } from "@/hooks/useModalDismiss"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { cn } from "@/lib/cn"
import { KEYBOARD_SHORTCUTS_HELP } from "@/lib/keyboard-shortcuts"

interface ShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

export function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(open)
  useModalDismiss(open, onClose, backdropRef)

  const sections = useMemo(() => {
    const groups: Record<string, typeof KEYBOARD_SHORTCUTS_HELP> = {
      General: [],
      Playback: [],
      Navigation: [],
      Library: [],
    }

    for (const item of KEYBOARD_SHORTCUTS_HELP) {
      if (
        item.action.includes("Play") ||
        item.action.includes("Stop") ||
        item.action.includes("track") ||
        item.action.includes("Volume")
      ) {
        groups.Playback.push(item)
      } else if (
        item.action.includes("Search") ||
        item.action.includes("Settings") ||
        item.action.includes("Sidebar") ||
        item.action.includes("Toggle queue")
      ) {
        groups.General.push(item)
      } else if (item.action.includes("Seek") || item.action.includes("Jump")) {
        groups.Navigation.push(item)
      } else {
        groups.Library.push(item)
      }
    }
    return groups
  }, [])

  if (!shouldRender) return null

  return createPortal(
    <div
      ref={backdropRef}
      onTransitionEnd={onBackdropTransitionEnd}
      className={cn(
        "ol-backdrop fixed inset-0 z-50 flex items-center justify-center bg-canvas/60 backdrop-blur-sm px-4",
        showOverlay && "ol-open"
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts Map"
        className={cn(
          "ol-panel relative flex h-full max-h-[min(80vh,740px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-border bg-surface/95 shadow-panel backdrop-blur-3xl",
          showOverlay && "ol-open"
        )}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border/60 px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-1">
            <h2 className="type-heading m-0">Keyboard Shortcuts</h2>
            <p className="type-meta m-0 text-subtle">Efficiency at your fingertips</p>
          </div>
          <IconButton size="md" onClick={onClose} title="Close overlay">
            <X className="h-5 w-5" />
          </IconButton>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-8 sm:px-8">
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
            {Object.entries(sections).map(([name, items]) => (
              <section key={name} className="flex flex-col gap-4">
                <h3 className="type-meta font-semibold uppercase tracking-wider text-accent">
                  {name}
                </h3>
                <div className="flex flex-col gap-3">
                  {items.map((item) => (
                    <div
                      key={item.action}
                      className="group flex items-center justify-between gap-4 border-b border-white/[0.04] pb-3 last:border-0 last:pb-0"
                    >
                      <span className="type-body-sm text-foreground/90 transition-colors group-hover:text-foreground">
                        {item.action}
                      </span>
                      <kbd className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-md border border-white/12 bg-white/[0.06] px-2 font-sans text-[0.75rem] font-medium text-muted shadow-sm group-hover:border-white/20 group-hover:text-foreground">
                        {item.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>

        <footer className="border-t border-border/60 bg-white/[0.02] px-6 py-4 sm:px-8">
          <p className="type-meta text-center text-subtle">
            Press <kbd className="mx-1 rounded bg-white/10 px-1.5 py-0.5 text-foreground">?</kbd>{" "}
            anywhere to view this map
          </p>
        </footer>
      </div>
    </div>,
    document.body
  )
}
