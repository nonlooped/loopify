import { useEffect, useRef } from "react"
import Lenis from "lenis"
import { useReducedMotion } from "motion/react"
import { useLocation } from "react-router-dom"

/**
 * Mounts Lenis smooth scroll only on the marketing home route, and only when
 * the user hasn't asked for reduced motion. Everywhere else the native scroll
 * is left untouched so the app surfaces (/controller, /commands) stay snappy.
 *
 * motion/react's `useScroll` hook reads the window scroll position, which
 * Lenis drives directly via `window.scrollTo`, so scroll-linked animations in
 * child components work without any extra bridging.
 */
export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  const location = useLocation()
  const active = !reduceMotion && location.pathname === "/"
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    if (!active) return

    const lenis = new Lenis({
      lerp: 0.12,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1,
      touchMultiplier: 1,
    })
    lenisRef.current = lenis

    let rafId = 0
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      lenisRef.current = null
    }
  }, [active])

  return <>{children}</>
}
