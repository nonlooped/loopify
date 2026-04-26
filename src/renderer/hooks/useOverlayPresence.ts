import { useCallback, useEffect, useRef, useState } from "react"
import { usePrefersReducedMotion } from "./usePrefersReducedMotion"

/**
 * Keeps overlay DOM mounted through exit so opacity/transform transitions can complete.
 * Add class `ol-open` to backdrop and panel when `showOverlay` is true.
 */
export function useOverlayPresence(isOpen: boolean) {
  const reduced = usePrefersReducedMotion()
  const [mounted, setMounted] = useState(false)
  const [showOverlay, setShowOverlay] = useState(false)
  const wasRevealedRef = useRef(false)
  const genRef = useRef(0)
  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen

  // Open: mount and run enter transition (do not depend on `mounted` to avoid re-enter flashes)
  useEffect(() => {
    if (!isOpen) return

    genRef.current += 1
    const g = genRef.current
    wasRevealedRef.current = false
    setMounted(true)
    if (reduced) {
      setShowOverlay(true)
      wasRevealedRef.current = true
      return
    }
    setShowOverlay(false)
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (genRef.current !== g) return
        if (!isOpenRef.current) return
        setShowOverlay(true)
        wasRevealedRef.current = true
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [isOpen, reduced])

  // Close: start exit, then unmount when transition finished or if enter never completed
  useEffect(() => {
    if (isOpen) return
    if (!mounted) return

    if (reduced) {
      setShowOverlay(false)
      setMounted(false)
      wasRevealedRef.current = false
      return
    }

    setShowOverlay(false)
    if (!wasRevealedRef.current) {
      requestAnimationFrame(() => {
        if (isOpenRef.current) return
        setMounted(false)
      })
    }
  }, [isOpen, mounted, reduced])

  const onBackdropTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return
      if (e.propertyName !== "opacity") return
      if (isOpenRef.current) return
      if (reduced) return
      if (!wasRevealedRef.current) return
      wasRevealedRef.current = false
      setMounted(false)
    },
    [reduced]
  )

  return {
    shouldRender: mounted,
    showOverlay,
    onBackdropTransitionEnd,
  }
}
