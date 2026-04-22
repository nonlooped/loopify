import { LogInIcon, LogOutIcon, MoonStarIcon, SunMediumIcon } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Wordmark } from "@/components/wordmark"
import { cn } from "@/lib/utils"

import { NAV_ITEMS } from "./nav-items"

type ThemeMode = "light" | "dark"

type AppSidebarDrawerProps = {
  open: boolean
  onClose: () => void
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

export function AppSidebarDrawer({
  open,
  onClose,
  theme,
  onToggleTheme,
  isSignedIn,
  authReady,
}: AppSidebarDrawerProps) {
  const location = useLocation()

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose()
        }
      }}
    >
      <SheetContent
        side="left"
        className={cn(
          "w-[min(18rem,85vw)] p-0 sm:max-w-[min(18rem,85vw)]",
          "border-r border-border bg-background text-foreground",
          "lg:hidden",
        )}
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Primary navigation</SheetTitle>
          <SheetDescription>
            Navigate between pages, switch themes, and manage your session.
          </SheetDescription>
        </SheetHeader>

        <div className="flex h-16 shrink-0 items-center border-b border-border/70 px-5">
          <NavLink
            to="/"
            aria-label="Loopify home"
            onClick={onClose}
            className="text-foreground transition-opacity hover:opacity-80"
          >
            <Wordmark size="md" accent />
          </NavLink>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active = isRouteActive(location.pathname, item.to)
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center gap-3 rounded-xl px-3 text-base font-medium",
                  "transition-colors",
                  active
                    ? "bg-muted/70 text-foreground"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-primary"
                  />
                ) : null}
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div className="flex flex-col gap-1 border-t border-border/70 px-3 py-3">
          <Button
            variant="ghost"
            onClick={onToggleTheme}
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            className="h-12 w-full justify-start gap-3 rounded-xl px-3 text-base font-medium text-muted-foreground hover:text-foreground"
          >
            {theme === "dark" ? (
              <SunMediumIcon className="size-5 shrink-0" aria-hidden="true" />
            ) : (
              <MoonStarIcon className="size-5 shrink-0" aria-hidden="true" />
            )}
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </Button>

          {authReady ? (
            isSignedIn ? (
              <Button
                asChild
                variant="ghost"
                className="h-12 w-full justify-start gap-3 rounded-xl px-3 text-base font-medium text-muted-foreground hover:text-foreground"
              >
                <a href="/auth/logout">
                  <LogOutIcon className="size-5 shrink-0" aria-hidden="true" />
                  <span>Sign out</span>
                </a>
              </Button>
            ) : (
              <Button
                asChild
                variant="ghost"
                className={cn(
                  "h-12 w-full justify-start gap-3 rounded-xl bg-primary/10 px-3 text-base font-medium",
                  "text-foreground ring-1 ring-inset ring-primary/20 hover:bg-primary/15",
                )}
              >
                <NavLink to="/login" onClick={onClose}>
                  <LogInIcon
                    className="size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span>Sign in</span>
                </NavLink>
              </Button>
            )
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
