import { LogInIcon, LogOutIcon, MoonStarIcon, SunMediumIcon } from "lucide-react"
import { motion } from "motion/react"
import { NavLink, useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { LoopMark, Wordmark } from "@/components/wordmark"
import { cn } from "@/lib/utils"

import { NAV_ITEMS } from "./nav-items"

type ThemeMode = "light" | "dark"

type AppSidebarProps = {
  theme: ThemeMode
  onToggleTheme: () => void
  isSignedIn: boolean
  authReady: boolean
}

function isRouteActive(pathname: string, to: string): boolean {
  if (to === "/") {
    return pathname === "/"
  }
  return pathname === to || pathname.startsWith(`${to}/`)
}

/**
 * Desktop-only vertical rail. Rests at 64px and expands to 240px on hover or
 * keyboard focus-within, revealing labels. The expansion overlays the main
 * content area rather than reflowing it so dense pages (Room, Commands) never
 * jitter when the cursor brushes the edge.
 */
export function AppSidebar({
  theme,
  onToggleTheme,
  isSignedIn,
  authReady,
}: AppSidebarProps) {
  const location = useLocation()

  return (
    <aside
      aria-label="Primary"
      className={cn(
        "group/sidebar fixed inset-y-0 left-0 z-40 hidden overflow-hidden",
        "w-16 border-r border-border bg-background/85 backdrop-blur",
        "transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "hover:w-60 focus-within:w-60",
        "hover:shadow-[0_0_40px_-12px_rgba(0,0,0,0.35)] focus-within:shadow-[0_0_40px_-12px_rgba(0,0,0,0.35)]",
        "lg:flex lg:flex-col",
      )}
    >
      {/* Brand — crossfades from the loop glyph to the full wordmark when the
          rail expands. Kept inside its own bordered block so the nav below
          reads as a distinct panel. */}
      <NavLink
        to="/"
        aria-label="Loopify home"
        className="relative flex h-16 shrink-0 items-center border-b border-border/70 px-5 text-foreground transition-opacity hover:opacity-90"
      >
        <span className="relative flex h-5 w-full items-center">
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-0 flex h-full w-6 items-center justify-center",
              "transition-opacity duration-200",
              "group-hover/sidebar:opacity-0 group-focus-within/sidebar:opacity-0",
            )}
          >
            <LoopMark accent />
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-0 flex h-full items-center",
              "opacity-0 transition-opacity duration-300 delay-100",
              "group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100",
            )}
          >
            <Wordmark size="md" accent />
          </span>
        </span>
      </NavLink>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = isRouteActive(location.pathname, item.to)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center gap-3 rounded-xl pl-3 text-sm font-medium outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring/40",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? (
                <>
                  <motion.span
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-xl bg-muted/70"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    aria-hidden="true"
                  />
                  <motion.span
                    layoutId="sidebar-active-bar"
                    className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    aria-hidden="true"
                  />
                </>
              ) : null}
              <Icon className="relative z-10 size-5 shrink-0" aria-hidden="true" />
              <span
                className={cn(
                  "relative z-10 whitespace-nowrap",
                  "-translate-x-1 opacity-0 transition-[opacity,transform] duration-200 delay-75",
                  "group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100",
                  "group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100",
                )}
              >
                {item.label}
              </span>
            </NavLink>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1 border-t border-border/70 px-2 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onToggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="relative h-11 w-full justify-start gap-3 rounded-xl pl-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? (
            <SunMediumIcon className="size-5 shrink-0" aria-hidden="true" />
          ) : (
            <MoonStarIcon className="size-5 shrink-0" aria-hidden="true" />
          )}
          <span
            className={cn(
              "whitespace-nowrap",
              "-translate-x-1 opacity-0 transition-[opacity,transform] duration-200 delay-75",
              "group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100",
              "group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100",
            )}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </span>
        </Button>

        {authReady ? (
          isSignedIn ? (
            <Button
              asChild
              variant="ghost"
              className="relative h-11 w-full justify-start gap-3 rounded-xl pl-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <a href="/auth/logout">
                <LogOutIcon className="size-5 shrink-0" aria-hidden="true" />
                <span
                  className={cn(
                    "whitespace-nowrap",
                    "-translate-x-1 opacity-0 transition-[opacity,transform] duration-200 delay-75",
                    "group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100",
                    "group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100",
                  )}
                >
                  Sign out
                </span>
              </a>
            </Button>
          ) : (
            <Button
              asChild
              variant="ghost"
              className={cn(
                "relative h-11 w-full justify-start gap-3 rounded-xl bg-primary/10 pl-3 text-sm font-medium",
                "text-foreground ring-1 ring-inset ring-primary/20 hover:bg-primary/15",
              )}
            >
              <NavLink to="/login">
                <LogInIcon
                  className="size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    "whitespace-nowrap",
                    "-translate-x-1 opacity-0 transition-[opacity,transform] duration-200 delay-75",
                    "group-hover/sidebar:translate-x-0 group-hover/sidebar:opacity-100",
                    "group-focus-within/sidebar:translate-x-0 group-focus-within/sidebar:opacity-100",
                  )}
                >
                  Sign in
                </span>
              </NavLink>
            </Button>
          )
        ) : null}
      </div>
    </aside>
  )
}
