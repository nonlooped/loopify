import { MoonStarIcon, SunMediumIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type ThemeToggleProps = {
  theme: "light" | "dark"
  onToggle: () => void
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={onToggle}
      aria-label={
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
      }
      className="rounded-full"
    >
      {theme === "dark" ? <SunMediumIcon /> : <MoonStarIcon />}
    </Button>
  )
}
