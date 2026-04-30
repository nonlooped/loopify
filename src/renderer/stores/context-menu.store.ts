import type { ReactNode } from "react"
import { create } from "zustand"

export type ContextMenuItem =
  | {
      type: "item"
      label: string
      icon?: ReactNode
      shortcut?: string
      checked?: boolean
      disabled?: boolean
      destructive?: boolean
      onSelect: () => void
    }
  | { type: "separator" }
  | {
      type: "submenu"
      label: string
      icon?: ReactNode
      items: ContextMenuItem[]
    }

interface ContextMenuState {
  isOpen: boolean
  x: number
  y: number
  items: ContextMenuItem[]
  show: (x: number, y: number, items: ContextMenuItem[]) => void
  hide: () => void
}

export const useContextMenuStore = create<ContextMenuState>()((set) => ({
  isOpen: false,
  x: 0,
  y: 0,
  items: [],
  show: (x, y, items) => set({ isOpen: true, x, y, items }),
  hide: () => set({ isOpen: false }),
}))

/** Prevent default + show context menu at cursor position. */
export function showContextMenu(e: React.MouseEvent, items: ContextMenuItem[]) {
  e.preventDefault()
  useContextMenuStore.getState().show(e.clientX, e.clientY, items)
}
