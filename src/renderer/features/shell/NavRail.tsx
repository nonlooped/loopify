import {
  Download,
  HardDrive,
  Heart,
  LayoutGrid,
  ListMusic,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
} from "lucide-react"
import { memo, type ReactNode, useCallback } from "react"
import { LIKED_SONGS_PLAYLIST_ID, OFFLINE_SONGS_PLAYLIST_ID } from "src/shared/types/music"
import { LoopifyMark } from "@/components/branding/LoopifyMark"
import { LoopifyWordmark } from "@/components/branding/LoopifyWordmark"
import { cn } from "@/lib/cn"
import { formatModShortcut, formatModShortcutTitle } from "@/lib/shortcut"

const rowBase =
  "group relative flex w-full min-w-0 min-h-14 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-[transform,opacity,background-color,color,box-shadow] duration-ui ease-out-quart motion-reduce:transition-none"

const rowInteractive = cn(
  rowBase,
  "cursor-pointer text-muted hover:bg-white/5 hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50",
  "active:scale-[0.98] motion-reduce:active:scale-100"
)

const rowActive = cn(
  rowBase,
  "bg-white/[0.08] text-foreground shadow-[inset_0_0_0_1px_oklch(1_0_0/0.1)]"
)

const iconWrap = (active: boolean) =>
  cn(
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-ui ease-out-quart",
    active
      ? "bg-accent/15 text-accent"
      : "bg-white/5 text-muted group-hover:bg-white/10 group-hover:text-foreground"
  )

interface NavRailProps {
  isExpanded: boolean
  onToggleExpand: () => void
  activePlaylistId: string | null
  onGoToCollection: () => void
  onSelectPlaylist: (id: string) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  onOpenImport: () => void
  onCreatePlaylist: () => void
  queueLength: number
  isQueueOpen: boolean
  onToggleQueue: () => void
}

function NavRailImpl({
  isExpanded,
  onToggleExpand,
  activePlaylistId,
  onGoToCollection,
  onSelectPlaylist,
  onOpenSearch,
  onOpenSettings,
  onOpenImport,
  onCreatePlaylist,
  queueLength,
  isQueueOpen,
  onToggleQueue,
}: NavRailProps) {
  const atCollection = activePlaylistId == null
  const likedActive = activePlaylistId === LIKED_SONGS_PLAYLIST_ID
  const offlineActive = activePlaylistId === OFFLINE_SONGS_PLAYLIST_ID

  const goToLiked = useCallback(() => onSelectPlaylist(LIKED_SONGS_PLAYLIST_ID), [onSelectPlaylist])
  const goToOffline = useCallback(
    () => onSelectPlaylist(OFFLINE_SONGS_PLAYLIST_ID),
    [onSelectPlaylist]
  )

  return (
    <aside
      className={cn(
        "relative z-40 flex h-full min-h-0 shrink-0 flex-col border-r border-border",
        "bg-surface/95 text-foreground shadow-panel backdrop-blur-3xl",
        "transition-[width] duration-300 ease-out-quart motion-reduce:transition-none",
        isExpanded ? "w-80" : "w-21"
      )}
      aria-label="Primary navigation"
    >
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
                  onClick={onToggleExpand}
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                  className="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-xl p-0 transition-transform duration-ui ease-out-quart hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/50 motion-reduce:transition-none motion-reduce:hover:scale-100"
                />
              ) : null}
            </div>
            <div
              className={cn(
                "flex min-w-0 flex-col justify-center overflow-hidden pr-0.5",
                "transition-[opacity,transform] duration-300 ease-out-quart motion-reduce:translate-x-0 motion-reduce:transition-none",
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

        <nav className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-contain">
          <div className="flex flex-col gap-0.5">
            <SectionLabel expanded={isExpanded}>Browse</SectionLabel>
            <NavRow
              expanded={isExpanded}
              label="Library"
              description="Your music collection"
              active={atCollection}
              selection="location"
              onClick={onGoToCollection}
              title="Library"
              icon={<LayoutGrid className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />}
            />
            <NavRow
              expanded={isExpanded}
              label="Liked songs"
              description="Your favorites"
              active={likedActive}
              selection="location"
              onClick={goToLiked}
              title="Liked songs"
              icon={<Heart className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />}
            />
            <NavRow
              expanded={isExpanded}
              label="Offline"
              description="Playable without internet"
              active={offlineActive}
              selection="location"
              onClick={goToOffline}
              title="Offline songs"
              icon={<HardDrive className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />}
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <SectionLabel expanded={isExpanded}>Find &amp; add</SectionLabel>
            <NavRow
              expanded={isExpanded}
              label="Search"
              description="Find any song"
              hint={formatModShortcut("K")}
              active={false}
              selection="none"
              onClick={onOpenSearch}
              title={`Search (${formatModShortcutTitle("K")})`}
              icon={<Search className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />}
            />
            <NavRow
              expanded={isExpanded}
              label="Import"
              description="Add from YouTube or Spotify"
              active={false}
              selection="none"
              onClick={onOpenImport}
              title="Import a playlist"
              icon={<Download className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />}
            />
            <NavRow
              expanded={isExpanded}
              label="New playlist"
              description="Start a fresh list"
              active={false}
              selection="none"
              onClick={onCreatePlaylist}
              title="New playlist"
              icon={<Plus className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />}
            />
          </div>

          <div className="flex flex-col gap-0.5">
            <SectionLabel expanded={isExpanded}>Play</SectionLabel>
            <NavRow
              expanded={isExpanded}
              label="Queue"
              hint={queueLength > 0 ? String(queueLength) : undefined}
              description={queueLength > 0 ? "Your queue" : undefined}
              active={isQueueOpen}
              selection="toggle"
              onClick={onToggleQueue}
              title={isQueueOpen ? "Close queue" : "Open queue"}
              icon={<ListMusic className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />}
            />
          </div>
        </nav>

        <div className="mt-auto flex flex-col gap-1 border-t border-border/80 pt-4">
          <button
            type="button"
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
            className={rowInteractive}
          >
            <span className={iconWrap(false)}>
              {isExpanded ? (
                <PanelLeftClose className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <PanelLeftOpen className="h-5 w-5" strokeWidth={1.75} />
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
            onClick={onOpenSettings}
            title="Settings"
            icon={<Settings className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.75} />}
          />
        </div>
      </div>
    </aside>
  )
}

export const NavRail = memo(NavRailImpl)
NavRail.displayName = "NavRail"

/** Reserves the same vertical space in expanded and collapsed modes to avoid nav jumping. */
function SectionLabel({ children, expanded }: { children: ReactNode; expanded: boolean }) {
  return (
    <div className="mb-1.5 flex h-5 min-w-0 shrink-0 items-end px-2">
      <p
        className={cn(
          "type-meta m-0 min-w-0 max-w-full truncate text-subtle",
          !expanded && "invisible"
        )}
      >
        {children}
      </p>
    </div>
  )
}

function NavRow({
  expanded,
  label,
  description,
  hint,
  active,
  selection = "none",
  onClick,
  title,
  icon,
}: {
  expanded: boolean
  label: string
  description?: string
  active: boolean
  selection?: "location" | "toggle" | "none"
  onClick: () => void
  title: string
  icon: ReactNode
  hint?: string
}) {
  const ariaCurrent = selection === "location" && active ? "page" : undefined
  const ariaPressed = selection === "toggle" ? active : undefined

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={expanded ? undefined : label}
      aria-current={ariaCurrent}
      aria-pressed={ariaPressed}
      data-active={active || undefined}
      className={cn(active ? rowActive : rowInteractive, "items-center")}
    >
      <span className={iconWrap(active)}>{icon}</span>
      {expanded ? (
        <span className="min-w-0 flex-1 overflow-hidden text-left">
          <span className="type-body-sm block truncate font-medium text-foreground">{label}</span>
          <span
            className={cn(
              "type-meta mt-0.5 block min-h-4 max-w-full truncate leading-[1.3]",
              description ? "text-subtle" : "invisible select-none"
            )}
            aria-hidden={!description}
          >
            {description || "\u00A0"}
          </span>
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
