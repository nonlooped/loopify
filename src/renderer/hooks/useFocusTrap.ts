import { useCallback, useEffect, useRef } from "react"

const FOCUSABLE_SELECTOR = [
  'button:not([disabled]):not([aria-hidden="true"])',
  "a[href]",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  "[contenteditable]",
].join(", ")

/**
 * Traps focus within a container while it is active.
 * Automatically focuses the first focusable element on activation,
 * and restores focus to the previously focused element on deactivation.
 */
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (active) {
      previousFocusRef.current = document.activeElement as HTMLElement | null
      // Defer focus to next tick so the DOM is rendered
      const raf = requestAnimationFrame(() => {
        const container = containerRef.current
        if (!container) return
        const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        const first = focusable[0]
        if (first) {
          first.focus()
        }
      })
      return () => cancelAnimationFrame(raf)
    }
    return () => {
      if (!active && previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }
  }, [active])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return
    const container = containerRef.current
    if (!container) return
    const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusable.length === 0) return

    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const activeEl = document.activeElement as HTMLElement | null

    if (e.shiftKey) {
      if (activeEl === first || !container.contains(activeEl)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  return { containerRef, handleKeyDown }
}
