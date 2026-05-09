import { autoUpdate, flip, offset, shift, useFloating } from "@floating-ui/react"
import { Check, ChevronRight } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { cn } from "@/lib/cn"
import { type ContextMenuItem, useContextMenuStore } from "@/stores/context-menu.store"

const SUBMENU_OPEN_DELAY = 120
const SUBMENU_CLOSE_DELAY = 180

/* ---------------------------------------------------------------------------
 * Renderer – single instance mounted at app root via portal
 * ----------------------------------------------------------------------- */

export function ContextMenuRenderer() {
  const isOpen = useContextMenuStore((s) => s.isOpen)
  const x = useContextMenuStore((s) => s.x)
  const y = useContextMenuStore((s) => s.y)
  const items = useContextMenuStore((s) => s.items)
  const hide = useContextMenuStore((s) => s.hide)

  const { shouldRender, showOverlay, onBackdropTransitionEnd } = useOverlayPresence(isOpen)

  /* Position --------------------------------------------------------------- */
  const cursorReference = useMemo(
    () => ({
      getBoundingClientRect: () =>
        ({
          x,
          y,
          top: y,
          right: x,
          bottom: y,
          left: x,
          width: 0,
          height: 0,
          toJSON: () => null,
        }) as DOMRect,
    }),
    [x, y]
  )

  const {
    refs: menuRefs,
    floatingStyles: menuFloatingStyles,
    update: updateMenuPosition,
  } = useFloating({
    open: shouldRender,
    placement: "right-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(0), flip({ padding: 4 }), shift({ padding: 4 })],
  })

  useEffect(() => {
    if (!shouldRender) return
    menuRefs.setPositionReference(cursorReference)
    updateMenuPosition()
  }, [cursorReference, menuRefs, shouldRender, updateMenuPosition])

  /* Keyboard focus --------------------------------------------------------- */
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const itemEls = useRef(new Map<number, HTMLDivElement>())

  const focusableIndices = useMemo(() => {
    const out: number[] = []
    items.forEach((item, i) => {
      if (item.type !== "separator" && !(item.type === "item" && item.disabled)) out.push(i)
    })
    return out
  }, [items])

  useEffect(() => {
    if (isOpen) {
      setFocusedIndex(focusableIndices.length > 0 ? focusableIndices[0] : -1)
    } else {
      setFocusedIndex(-1)
    }
  }, [isOpen, focusableIndices])

  useEffect(() => {
    if (focusedIndex >= 0) {
      itemEls.current.get(focusedIndex)?.focus({ preventScroll: true })
    }
  }, [focusedIndex])

  /* Submenu --------------------------------------------------------------- */
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    refs: submenuRefs,
    floatingStyles: submenuFloatingStyles,
    update: updateSubmenuPosition,
  } = useFloating({
    open: activeSubmenuIndex != null,
    placement: "right-start",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(2),
      flip({
        padding: 4,
        fallbackPlacements: ["left-start"],
      }),
      shift({ padding: 4 }),
    ],
  })

  /* Submenu keyboard focus */
  const [subFocusedIndex, setSubFocusedIndex] = useState(-1)
  const subItemEls = useRef(new Map<number, HTMLDivElement>())

  const activeSubmenuItem = useMemo(
    () =>
      activeSubmenuIndex != null && items[activeSubmenuIndex]?.type === "submenu"
        ? items[activeSubmenuIndex]
        : null,
    [activeSubmenuIndex, items]
  )

  const subFocusableIndices = useMemo(() => {
    if (!activeSubmenuItem) return []
    const out: number[] = []
    activeSubmenuItem.items.forEach((item, i) => {
      if (item.type !== "separator" && !(item.type === "item" && item.disabled)) out.push(i)
    })
    return out
  }, [activeSubmenuItem])

  /* Submenu enter animation */
  const [submenuShow, setSubmenuShow] = useState(false)

  useEffect(() => {
    if (activeSubmenuItem) {
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setSubmenuShow(true))
      })
      return () => cancelAnimationFrame(raf)
    }
    setSubmenuShow(false)
  }, [activeSubmenuItem])

  useEffect(() => {
    if (activeSubmenuItem) {
      setSubFocusedIndex(subFocusableIndices.length > 0 ? subFocusableIndices[0] : -1)
    } else {
      setSubFocusedIndex(-1)
    }
  }, [activeSubmenuItem, subFocusableIndices])

  useEffect(() => {
    if (subFocusedIndex >= 0) {
      subItemEls.current.get(subFocusedIndex)?.focus({ preventScroll: true })
    }
  }, [subFocusedIndex])

  const clearTimers = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      clearTimers()
      setActiveSubmenuIndex(null)
      setSubFocusedIndex(-1)
      setSubmenuShow(false)
    }
    return clearTimers
  }, [isOpen, clearTimers])

  const scheduleSubmenuOpen = useCallback(
    (index: number, el: HTMLDivElement) => {
      clearTimers()
      if (activeSubmenuIndex === index) return
      setActiveSubmenuIndex(null)
      openTimer.current = setTimeout(() => {
        submenuRefs.setReference(el)
        setActiveSubmenuIndex(index)
        setSubFocusedIndex(-1)
        openTimer.current = null
      }, SUBMENU_OPEN_DELAY)
    },
    [activeSubmenuIndex, clearTimers, submenuRefs]
  )

  const scheduleSubmenuClose = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
    closeTimer.current = setTimeout(() => {
      setActiveSubmenuIndex(null)
      setSubFocusedIndex(-1)
      setSubmenuShow(false)
      closeTimer.current = null
    }, SUBMENU_CLOSE_DELAY)
  }, [])

  const cancelSubmenuClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  useEffect(() => {
    if (activeSubmenuItem) updateSubmenuPosition()
  }, [activeSubmenuItem, updateSubmenuPosition])

  /* Submenu keyboard */
  const handleSubmenuKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!activeSubmenuItem) return
      const subItems = activeSubmenuItem.items
      if (e.key === "ArrowDown") {
        e.preventDefault()
        e.stopPropagation()
        const ci = subFocusableIndices.indexOf(subFocusedIndex)
        setSubFocusedIndex(subFocusableIndices[ci < subFocusableIndices.length - 1 ? ci + 1 : 0])
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        e.stopPropagation()
        const ci = subFocusableIndices.indexOf(subFocusedIndex)
        setSubFocusedIndex(subFocusableIndices[ci > 0 ? ci - 1 : subFocusableIndices.length - 1])
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        e.stopPropagation()
        if (subFocusedIndex >= 0 && subFocusedIndex < subItems.length) {
          const item = subItems[subFocusedIndex]
          if (item.type === "item" && !item.disabled) {
            item.onSelect()
            hide()
          }
        }
      } else if (e.key === "ArrowLeft" || e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        setActiveSubmenuIndex(null)
        setSubFocusedIndex(-1)
        setSubmenuShow(false)
        // Return focus to parent trigger
        if (activeSubmenuIndex != null) {
          itemEls.current.get(activeSubmenuIndex)?.focus({ preventScroll: true })
          setFocusedIndex(activeSubmenuIndex)
        }
      }
    },
    [activeSubmenuItem, subFocusedIndex, subFocusableIndices, hide, activeSubmenuIndex]
  )

  /* Keyboard --------------------------------------------------------------- */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        const ci = focusableIndices.indexOf(focusedIndex)
        setFocusedIndex(focusableIndices[ci < focusableIndices.length - 1 ? ci + 1 : 0])
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const ci = focusableIndices.indexOf(focusedIndex)
        setFocusedIndex(focusableIndices[ci > 0 ? ci - 1 : focusableIndices.length - 1])
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < items.length) {
          const item = items[focusedIndex]
          if (item.type === "item" && !item.disabled) {
            item.onSelect()
            hide()
          } else if (item.type === "submenu") {
            const el = itemEls.current.get(focusedIndex)
            if (el) scheduleSubmenuOpen(focusedIndex, el)
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        hide()
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        e.stopPropagation()
        const item = items[focusedIndex]
        if (item?.type === "submenu") {
          const el = itemEls.current.get(focusedIndex)
          if (el) scheduleSubmenuOpen(focusedIndex, el)
        }
      }
    },
    [focusedIndex, focusableIndices, items, hide, scheduleSubmenuOpen]
  )

  /* Render ---------------------------------------------------------------- */
  if (!shouldRender) return null

  return createPortal(
    <>
      {/* Backdrop: invisible click-away zone */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: overlay dismiss target */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: overlay dismiss target */}
      <div
        className="fixed inset-0 z-[110]"
        onClick={hide}
        onContextMenu={(e) => {
          e.preventDefault()
          hide()
        }}
      />

      {/* Main menu panel */}
      <div
        ref={menuRefs.setFloating}
        role="menu"
        aria-label="Context menu"
        tabIndex={-1}
        style={menuFloatingStyles}
        className={cn(
          "ol-context-menu z-[110] min-w-[192px] max-w-[320px] rounded-xl border border-border bg-surface/95 py-1 shadow-panel backdrop-blur-2xl",
          showOverlay ? "ol-open" : ""
        )}
        onTransitionEnd={onBackdropTransitionEnd}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, i) =>
          item.type === "separator" ? (
            /* biome-ignore lint/suspicious/noArrayIndexKey: separators have no stable id */
            <div key={`s-${i}`} className="mx-2 my-1 h-px bg-border" />
          ) : (
            <MenuItemRow
              key={item.label}
              item={item}
              isFocused={focusedIndex === i}
              isExpanded={item.type === "submenu" && activeSubmenuIndex === i}
              onSelect={() => {
                if (item.type === "item") {
                  item.onSelect()
                  hide()
                }
              }}
              onHover={(el) => {
                setFocusedIndex(i)
                if (item.type === "submenu") scheduleSubmenuOpen(i, el)
                else {
                  clearTimers()
                  setActiveSubmenuIndex(null)
                }
              }}
              onSubmenuLeave={scheduleSubmenuClose}
              ref={(el) => {
                if (el) itemEls.current.set(i, el)
                else itemEls.current.delete(i)
              }}
            />
          )
        )}
      </div>

      {/* Submenu panel */}
      {activeSubmenuItem && (
        <div
          ref={submenuRefs.setFloating}
          role="menu"
          aria-label={`${activeSubmenuItem.label} submenu`}
          tabIndex={-1}
          style={submenuFloatingStyles}
          className={cn(
            "ol-context-menu z-[111] min-w-[192px] max-w-[280px] rounded-xl border border-border bg-surface/95 py-1 shadow-panel backdrop-blur-2xl",
            submenuShow ? "ol-open" : ""
          )}
          onMouseEnter={cancelSubmenuClose}
          onMouseLeave={scheduleSubmenuClose}
          onKeyDown={handleSubmenuKeyDown}
        >
          {activeSubmenuItem.items.map((item, i) =>
            item.type === "separator" ? (
              /* biome-ignore lint/suspicious/noArrayIndexKey: separators have no stable id */
              <div key={`ss-${i}`} className="mx-2 my-1 h-px bg-border" />
            ) : (
              <MenuItemRow
                key={item.label}
                item={item}
                isFocused={subFocusedIndex === i}
                onSelect={() => {
                  if (item.type === "item") {
                    item.onSelect()
                    hide()
                  }
                }}
                onHover={() => setSubFocusedIndex(i)}
                ref={(el) => {
                  if (el) subItemEls.current.set(i, el)
                  else subItemEls.current.delete(i)
                }}
              />
            )
          )}
        </div>
      )}
    </>,
    document.body
  )
}

/* ---------------------------------------------------------------------------
 * Row
 * ----------------------------------------------------------------------- */

interface MenuItemRowProps {
  item: ContextMenuItem & { type: "item" | "submenu" }
  isFocused: boolean
  isExpanded?: boolean
  onSelect: () => void
  onHover: (el: HTMLDivElement) => void
  onSubmenuLeave?: () => void
  ref?: (el: HTMLDivElement | null) => void
}

const MenuItemRow = function MenuItemRowImpl({
  item,
  isFocused,
  isExpanded,
  onSelect,
  onHover,
  onSubmenuLeave,
  ref,
}: MenuItemRowProps) {
  const isDisabled = item.type === "item" && item.disabled
  const isDestructive = item.type === "item" && item.destructive
  const isSubmenu = item.type === "submenu"

  return (
    <div
      ref={ref}
      role="menuitem"
      aria-disabled={isDisabled || undefined}
      aria-haspopup={isSubmenu ? "menu" : undefined}
      aria-expanded={isSubmenu ? isExpanded : undefined}
      tabIndex={isFocused ? 0 : -1}
      className={cn(
        "flex min-h-[32px] cursor-pointer select-none items-center gap-2 rounded-md px-3 outline-none transition-colors duration-ui ease-out-quart motion-reduce:transition-none",
        isFocused && !isDisabled && !isDestructive && "bg-white/[0.08]",
        isDisabled && "pointer-events-none opacity-50",
        isDestructive && !isDisabled && !isFocused && "text-danger/90",
        isDestructive && isFocused && "bg-danger/10 text-danger"
      )}
      onClick={(e) => {
        e.stopPropagation()
        if (!isDisabled) onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          e.stopPropagation()
          if (!isDisabled) onSelect()
        }
      }}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      onMouseLeave={isSubmenu ? onSubmenuLeave : undefined}
    >
      {/* Leading icon / check space */}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">
        {item.type === "item" && item.checked ? (
          <Check className="h-4 w-4 text-accent" strokeWidth={2} />
        ) : item.icon ? (
          item.icon
        ) : null}
      </span>

      {/* Label */}
      <span className="type-label min-w-0 flex-1 truncate text-foreground">{item.label}</span>

      {/* Trailing: shortcut or submenu arrow */}
      {item.type === "item" && item.shortcut && (
        <span className="type-meta shrink-0 text-subtle">{item.shortcut}</span>
      )}
      {isSubmenu && <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />}
    </div>
  )
}
