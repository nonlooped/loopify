import { useCallback, useEffect, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom"

import { TooltipProvider } from "@/components/ui/tooltip"
import { useAuth } from "@/lib/auth"

import { SmoothScrollProvider } from "./components/home/smooth-scroll-provider.js"
import { AppFooter } from "./components/shell/app-footer.js"
import { AppSidebar } from "./components/shell/app-sidebar.js"
import { AppSidebarDrawer } from "./components/shell/app-sidebar-drawer.js"
import { AppTopbarMobile } from "./components/shell/app-topbar-mobile.js"
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

function CommandsLegacyNameRedirect() {
  const { name } = useParams()
  if (!name) {
    return <Navigate to="/commands" replace />
  }
  return (
    <Navigate
      to={{ pathname: "/commands", search: `?${new URLSearchParams({ cmd: name }).toString()}` }}
      replace
    />
  )
}

function mainLayoutKey(pathname: string, search: string): string {
  const isCommands =
    pathname === "/commands" || pathname.startsWith("/commands/")
  if (isCommands) {
    return "/commands"
  }
  return pathname + search
}

export default function App() {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const auth = useAuth()

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.style.colorScheme = theme
    window.localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  // Collapse the mobile drawer any time the route changes so mid-flow taps
  // through navigation don't strand users behind a still-open panel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: react-router swaps `location` on every navigation; pathname+search is the signal we care about
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname, location.search])

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"))
  }, [])

  return (
    <SmoothScrollProvider>
      <TooltipProvider delayDuration={300}>
      <div className="relative min-h-svh overflow-x-hidden bg-background text-foreground">
        <AppSidebar
          theme={theme}
          onToggleTheme={toggleTheme}
          isSignedIn={auth.isSignedIn}
          authReady={!auth.isLoading}
        />
        <AppTopbarMobile
          onOpenMenu={() => setMobileMenuOpen(true)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
        <AppSidebarDrawer
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          theme={theme}
          onToggleTheme={toggleTheme}
          isSignedIn={auth.isSignedIn}
          authReady={!auth.isLoading}
        />

        <div className="flex min-h-svh flex-col lg:pl-16">
          {/*
            We key `motion.main` on pathname+search so every route swap fully
            remounts the page tree. An earlier version wrapped this in
            <AnimatePresence mode="wait">, but the home route's scroll-linked
            springs (Lenis + useScroll) kept the exit animation from completing
            and the new page never mounted, leaving stale content visible after
            navigation. A plain key-based fade-in sidesteps that entirely.
          */}
          <motion.main
            key={mainLayoutKey(location.pathname, location.search)}
            className="page-grid flex-1 py-10 sm:py-12"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={reduceMotion ? undefined : { opacity: 1 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <Routes location={location}>
              <Route path="/" element={<HomePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/controller" element={<ControllerPage />} />
              <Route path="/commands" element={<CommandsPage />} />
              <Route
                path="/commands/:name"
                element={<CommandsLegacyNameRedirect />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.main>

          <AppFooter />
        </div>
      </div>
      </TooltipProvider>
    </SmoothScrollProvider>
  )
}
