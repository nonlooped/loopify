import { HouseIcon, Music2Icon, TerminalSquareIcon } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

export type NavItem = {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const NAV_ITEMS: readonly NavItem[] = [
  { to: "/", label: "Home", icon: HouseIcon },
  { to: "/controller", label: "Room", icon: Music2Icon },
  { to: "/commands", label: "Commands", icon: TerminalSquareIcon },
] as const
