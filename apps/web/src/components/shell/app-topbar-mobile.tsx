import { MenuIcon } from "lucide-react"
import { NavLink } from "react-router-dom"

import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Wordmark } from "@/components/wordmark"
import { cn } from "@/lib/utils"

type ThemeMode = "light" | "dark"

type AppTopbarMobileProps = {
  onOpenMenu: () => void
  theme: ThemeMode
  onToggleTheme: () => void
}

/**
 * Slim sticky top bar shown below the `lg` breakpoint, where the desktop rail
 * is hidden. Keeps the brand anchored, exposes the drawer trigger, and still
 * surfaces theme switching without a full hamburger round-trip.
 */
export function AppTopbarMobile({
  onOpenMenu,
  theme,
  onToggleTheme,
}: AppTopbarMobileProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border",
        "bg-background/80 px-3 backdrop-blur",
        "lg:hidden",
      )}
    >
      <Button
        variant="ghost"
        size="icon-lg"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="rounded-full text-muted-foreground hover:text-foreground"
      >
        <MenuIcon className="size-5" aria-hidden="true" />
      </Button>

      <NavLink
        to="/"
        aria-label="Loopify home"
        className="flex min-w-0 items-center text-foreground transition-opacity hover:opacity-80"
      >
        <Wordmark size="md" accent />
      </NavLink>

      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </header>
  )
}
