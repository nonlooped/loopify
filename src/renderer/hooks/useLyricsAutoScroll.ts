import { useEffect, useRef } from "react"

export function useLyricsAutoScroll(activeIndex: number, reducedMotion: boolean) {
  const scrollRootRef = useRef<HTMLElement | null>(null)
  const userScrollUntilRef = useRef(0)
  const scrollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (activeIndex < 0 || Date.now() < userScrollUntilRef.current) return
    const root = scrollRootRef.current
    const active = root?.querySelector<HTMLElement>("[data-active='true']")
    active?.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" })
  }, [activeIndex, reducedMotion])

  const handleScroll = () => {
    userScrollUntilRef.current = Date.now() + 2500
    if (scrollTimerRef.current != null) {
      window.clearTimeout(scrollTimerRef.current)
    }
    scrollTimerRef.current = window.setTimeout(() => {
      userScrollUntilRef.current = 0
      scrollTimerRef.current = null
    }, 2500)
  }

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current != null) {
        window.clearTimeout(scrollTimerRef.current)
      }
    }
  }, [])

  return { scrollRootRef, handleScroll } as const
}
