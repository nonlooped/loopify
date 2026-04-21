import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"

import { ThemeToggle } from "./components/theme-toggle.js"
import { Wordmark } from "./components/wordmark.js"
import { CommandsPage } from "./pages/CommandsPage.js"
import { ControllerPage } from "./pages/ControllerPage.js"
import { HomePage } from "./pages/HomePage.js"
import { LoginPage } from "./pages/LoginPage.js"

type ThemeMode = "light" | "dark"

const THEME_KEY = "loopify-theme"

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark"
  }

  const stored = window.localStorage.getItem(THEME_KEY)
  if (stored === "light" || stored === "dark") {
    return stored
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export default function App() {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const auth = useAuth()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.style.colorScheme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  return (
    <div className="relative min-h-svh overflow-x-hidden bg-background text-foreground">
      <div className="page-grid relative flex min-h-svh flex-col">
        <header className="border-b border-border">
          <div className="flex h-14 items-center justify-between gap-4 sm:h-16">
            <NavLink
              to="/"
              aria-label="Loopify home"
              className="flex min-w-0 shrink items-center text-foreground transition-opacity hover:opacity-80"
            >
              <Wordmark size="md" />
            </NavLink>

            <nav
              aria-label="Primary"
              className="flex flex-1 items-center gap-4 sm:gap-8"
            >
              {[
                { to: "/", label: "Home" },
                { to: "/controller", label: "Room" },
                { to: "/commands", label: "Commands" },
              ].map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "text-sm font-medium transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <ThemeToggle
                theme={theme}
                onToggle={() =>
                  setTheme((current) => (current === "dark" ? "light" : "dark"))
                }
              />
              {!auth.isLoading ? (
                auth.isSignedIn ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href="/auth/logout">Sign out</a>
                  </Button>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <NavLink to="/login">Sign in</NavLink>
                  </Button>
                )
              ) : null}
            </div>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={location.pathname + location.search}
            className="flex-1 py-10 sm:py-12"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={reduceMotion ? undefined : { opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/controller" element={<ControllerPage />} />
              <Route path="/commands" element={<CommandsPage />} />
              <Route path="/commands/:name" element={<CommandsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.main>
        </AnimatePresence>

        <footer className="mt-auto border-t border-border py-6">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:justify-start">
            <Wordmark size="sm" accent className="text-foreground" />
            <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:inline-block" />
            <span>Music, together.</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
