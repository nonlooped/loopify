import {
  HardDrive,
  Heart,
  LayoutGrid,
  Link,
  ListMusic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
} from "lucide-react"
import { type ReactNode, useCallback, useState } from "react"
import {
  LIKED_SONGS_PLAYLIST_ID,
  OFFLINE_SONGS_PLAYLIST_ID,
  type Track,
} from "src/shared/types/music"
import { LoopifyMark } from "@/components/branding/LoopifyMark"
import { LoopifyWordmark } from "@/components/branding/LoopifyWordmark"
import { cn } from "@/lib/cn"
import { buildSystemPlaylistContextMenu } from "@/lib/context-menu-items"
import { DRAG_MIME_TYPES } from "@/lib/drag-drop"
import { formatModShortcut, formatModShortcutTitle } from "@/lib/shortcut"
import { useAppStore } from "@/stores/app.store"
import { showContextMenu } from "@/stores/context-menu.store"

const rowBase =
  "group relative flex w-full min-w-0 min-h-[56px] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-[transform,opacity,background-color,color,box-shadow] duration-ui ease-out-quart motion-reduce:transition-none"

const rowInteractive = cn(
  rowBase,
  "cursor-pointer text-muted hover:bg-white/[0.04] hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
  "active:scale-[0.99] motion-reduce:active:scale-100"
)

const rowActive = cn(
  rowBase,
  "bg-white/[0.08] text-foreground shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)]"
)

const iconWrap = (active: boolean) =>
  cn(
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-ui ease-out-quart",
    active ? "bg-accent/15 text-accent" : "bg-white/5 text-muted group-hover:text-foreground"
  )

export function NavRail() {
  const isExpanded = useAppStore((s) => s.isSidebarExpanded)
  const libraryView = useAppStore((s) => s.libraryView)
  const queueLength = useAppStore((s) => s.queue.length)
  const isQueueOpen = useAppStore((s) => s.isQueueOpen)
  const selectPlaylist = useAppStore((s) => s.selectPlaylistWithTransition)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const toggleSearch = useAppStore((s) => s.toggleSearch)
  const toggleSettings = useAppStore((s) => s.toggleSettings)
  const toggleImport = useAppStore((s) => s.toggleImport)
  const handleCreatePlaylist = useAppStore((s) => s.handleCreatePlaylist)
  const toggleQueue = useAppStore((s) => s.toggleQueue)
  const atCollection = libraryView.kind === "collection"
  const likedActive = libraryView.kind === "playlist" && libraryView.id === LIKED_SONGS_PLAYLIST_ID
  const offlineActive =
    libraryView.kind === "playlist" && libraryView.id === OFFLINE_SONGS_PLAYLIST_ID
  const [isLikedDropTarget, setIsLikedDropTarget] = useState(false)

  const handleLikedDragOver = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME_TYPES.TRACK)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setIsLikedDropTarget(true)
  }, [])

  const handleLikedDragLeave = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsLikedDropTarget(false)
  }, [])

  const handleLikedDrop = useCallback((e: React.DragEvent<HTMLButtonElement>) => {
    const raw = e.dataTransfer.getData(DRAG_MIME_TYPES.TRACK)
    setIsLikedDropTarget(false)
    if (!raw) return
    e.preventDefault()
    try {
      const track = JSON.parse(raw) as Track
      useAppStore.getState().handleAddTrackToPlaylist(LIKED_SONGS_PLAYLIST_ID, track)
    } catch (err) {
      console.error("Failed to parse dropped track payload", err)
    }
  }, [])

  const goToLiked = useCallback(() => selectPlaylist(LIKED_SONGS_PLAYLIST_ID), [selectPlaylist])
  const goToOffline = useCallback(() => selectPlaylist(OFFLINE_SONGS_PLAYLIST_ID), [selectPlaylist])

  return (
    <aside
      className={cn(
        "relative z-40 flex h-full min-h-0 shrink-0 flex-col border-r border-border/40",
        "bg-surface/95 text-foreground backdrop-blur-3xl",
        "transition-[width] duration-300 ease-out-quart motion-reduce:transition-none",
        isExpanded ? "w-64" : "w-20"
      )}
      aria-label="Primary navigation"
    >
      <div className="titlebar-drag pointer-events-auto absolute inset-x-0 top-0 h-9 z-0" />
      <div className="relative flex min-h-0 flex-1 flex-col px-2.5 pb-4 pt-5">
        <header className="mb-4 h-20 shrink-0">
          <div className="flex h-full w-full min-w-0 items-center gap-3">
            <div className="relative ml-2.5 h-10 w-10 shrink-0">
              <span className="block" aria-hidden>
                <LoopifyMark className="h-10 w-10 rounded-xl" />
              </span>
              {!isExpanded ? (
                <button
                  type="button"
                  onClick={() => toggleSidebar()}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                  className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-xl p-0 transition-transform duration-ui ease-out-quart hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 motion-reduce:transition-none motion-reduce:hover:scale-100"
                />
              ) : null}
            </div>
            <div
              className={cn(
                "flex min-w-0 flex-col justify-center overflow-hidden pr-0.5",
                "transition-[opacity,transform,max-width] duration-300 ease-out-quart motion-reduce:translate-x-0 motion-reduce:transition-none",
                isExpanded
                  ? "max-w-full flex-1 translate-x-0 opacity-100"
                  : "pointer-events-none w-0 max-w-0 flex-0 -translate-x-1 opacity-0"
              )}
              aria-hidden={!isExpanded}
            >
              <LoopifyWordmark compact showMark={false} className="min-w-0" />
              <p className="type-meta m-0 mt-1 truncate text-subtle">Library on this device</p>
            </div>
          </div>
        </header>

        <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="flex flex-col gap-0.5">
            <NavRow
              expanded={isExpanded}
              label="Library"
              active={atCollection}
              selection="location"
              onClick={() => selectPlaylist(null)}
              title="Library"
              icon={<LayoutGrid className="h-4 w-4" strokeWidth={2} />}
            />
            <NavRow
              expanded={isExpanded}
              label="Liked songs"
              active={likedActive}
              selection="location"
              onClick={goToLiked}
              title="Liked songs"
              icon={<Heart className="h-4 w-4" strokeWidth={2} />}
              isDropTarget={isLikedDropTarget}
              onDragOver={handleLikedDragOver}
              onDragLeave={handleLikedDragLeave}
              onDrop={handleLikedDrop}
              onContextMenu={(e) =>
                showContextMenu(e, buildSystemPlaylistContextMenu(LIKED_SONGS_PLAYLIST_ID))
              }
            />
            <NavRow
              expanded={isExpanded}
              label="Offline"
              active={offlineActive}
              selection="location"
              onClick={goToOffline}
              title="Offline songs"
              icon={<HardDrive className="h-4 w-4" strokeWidth={2} />}
              onContextMenu={(e) =>
                showContextMenu(e, buildSystemPlaylistContextMenu(OFFLINE_SONGS_PLAYLIST_ID))
              }
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <NavRow
              expanded={isExpanded}
              label="Search"
              hint={formatModShortcut("K")}
              active={false}
              selection="none"
              onClick={() => toggleSearch(true)}
              title={`Search (${formatModShortcutTitle("K")})`}
              icon={<Search className="h-4 w-4" strokeWidth={2} />}
            />
            <NavRow
              expanded={isExpanded}
              label="Import"
              active={false}
              selection="none"
              onClick={() => toggleImport(true)}
              title="Import a playlist"
              icon={<Link className="h-4 w-4" strokeWidth={2} />}
            />
            <NavRow
              expanded={isExpanded}
              label="New playlist"
              active={false}
              selection="none"
              onClick={handleCreatePlaylist}
              title="New playlist"
              icon={<Plus className="h-4 w-4" strokeWidth={2} />}
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <NavRow
              expanded={isExpanded}
              label="Queue"
              hint={queueLength > 0 ? String(queueLength) : undefined}
              active={isQueueOpen}
              selection="toggle"
              onClick={toggleQueue}
              title={isQueueOpen ? "Close queue" : "Open queue"}
              icon={<ListMusic className="h-4 w-4" strokeWidth={2} />}
            />
          </div>
        </nav>

        <div className="mt-auto flex flex-col gap-0.5 pt-4">
          <button
            type="button"
            onClick={() => toggleSidebar()}
            title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className={rowInteractive}
          >
            <span className={iconWrap(false)}>
              {isExpanded ? (
                <PanelLeftClose className="h-4 w-4" strokeWidth={2} />
              ) : (
                <PanelLeftOpen className="h-4 w-4" strokeWidth={2} />
              )}
            </span>
            {isExpanded ? (
              <span className="type-body-sm min-w-0 flex-1 truncate text-foreground">Collapse</span>
            ) : null}
          </button>
          <NavRow
            expanded={isExpanded}
            label="Settings"
            active={false}
            selection="none"
            onClick={() => toggleSettings(true)}
            title="Settings"
            icon={<Settings className="h-4 w-4" strokeWidth={2} />}
          />
        </div>
      </div>
    </aside>
  )
}

function NavRow({
  expanded,
  label,
  hint,
  active,
  selection = "none",
  onClick,
  title,
  icon,
  isDropTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onContextMenu,
}: {
  expanded: boolean
  label: string
  active: boolean
  selection?: "location" | "toggle" | "none"
  onClick: () => void
  title: string
  icon: ReactNode
  hint?: string
  isDropTarget?: boolean
  onDragOver?: (e: React.DragEvent<HTMLButtonElement>) => void
  onDragLeave?: (e: React.DragEvent<HTMLButtonElement>) => void
  onDrop?: (e: React.DragEvent<HTMLButtonElement>) => void
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  const ariaCurrent = selection === "location" && active ? "page" : undefined
  const ariaPressed = selection === "toggle" ? active : undefined

  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onContextMenu={onContextMenu}
      title={title}
      aria-label={expanded ? undefined : label}
      aria-current={ariaCurrent}
      aria-pressed={ariaPressed}
      data-active={active || undefined}
      className={cn(
        active ? rowActive : rowInteractive,
        isDropTarget && "bg-accent/15 ring-2 ring-accent/60"
      )}
    >
      <span className={iconWrap(active)}>{icon}</span>
      {expanded ? (
        <span className="min-w-0 flex-1 overflow-hidden text-left">
          <span className="type-body-sm block truncate text-foreground">{label}</span>
        </span>
      ) : null}
      {hint && expanded ? (
        <span className="type-meta shrink-0 self-center text-nowrap tabular-nums text-subtle">
          {hint}
        </span>
      ) : null}
    </button>
  )
}
