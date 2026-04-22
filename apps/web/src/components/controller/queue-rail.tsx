import { motion, useReducedMotion } from "motion/react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EraserIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { QueueItem } from "@/lib/contracts"
import { cn } from "@/lib/utils"

import { TrackRow } from "./track-row"

type SearchTrack = {
  encoded?: string
  info: { title?: string; author?: string; uri?: string; artworkUrl?: string }
}

function trackKey(t: QueueItem, fallback: string): string {
  return (
    t.encoded ??
    t.info.identifier ??
    t.info.uri ??
    `${t.info.title ?? "t"}-${t.info.author ?? ""}-${fallback}`
  )
}

export type QueueRailProps = {
  current: QueueItem | null | undefined
  queue: QueueItem[]
  search: string
  setSearch: (v: string) => void
  onSearch: () => void
  searchTracks: SearchTrack[]
  searchPending: boolean
  onAdd: (enc: string) => void
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
  onClear: () => void
  queueBusy: boolean
}

export function QueueRail(props: QueueRailProps) {
  const reduceMotion = useReducedMotion()
  const [panel, setPanel] = useState<"queue" | "search">("queue")

  useEffect(() => {
    if (props.searchTracks.length > 0) {
      setPanel("search")
    }
  }, [props.searchTracks.length])

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.45,
        ease: [0.22, 1, 0.36, 1],
        delay: reduceMotion ? 0 : 0.2,
      }}
      className="flex min-h-0 flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          value={panel}
          onValueChange={(v) => {
            if (v === "queue" || v === "search") {
              setPanel(v)
            }
          }}
          variant="outline"
          size="sm"
          className="bg-muted/30"
        >
          <ToggleGroupItem
            value="queue"
            className="data-[state=on]:bg-background data-[state=on]:text-foreground"
          >
            Up next
            {props.queue.length > 0 ? (
              <span className="ml-1.5 font-mono text-[0.65rem] tabular-nums text-muted-foreground">
                {props.queue.length}
              </span>
            ) : null}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="search"
            className="data-[state=on]:bg-background data-[state=on]:text-foreground"
          >
            <PlusIcon data-icon="inline-start" />
            Add
          </ToggleGroupItem>
        </ToggleGroup>
        {panel === "queue" && props.queue.length > 0 ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={props.onClear}
            disabled={props.queueBusy}
          >
            <EraserIcon data-icon="inline-start" />
            Clear
          </Button>
        ) : null}
      </div>

      {panel === "queue" ? (
        <QueuePanel {...props} />
      ) : (
        <SearchPanel {...props} />
      )}
    </motion.div>
  )
}

function QueuePanel(props: QueueRailProps) {
  if (props.queue.length === 0 && !props.current) {
    return (
      <Card
        size="sm"
        className="border border-dashed border-border bg-transparent py-0 shadow-none ring-0"
      >
        <CardContent className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            The queue is empty.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Tap “Add” to find something to play.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card size="sm" className="gap-0 overflow-hidden py-0">
      <CardContent className="p-0">
        {props.current ? (
          <>
            <TrackRow
              title={props.current.info.title ?? "Untitled"}
              subtitle={props.current.info.author ?? ""}
              artworkUrl={props.current.info.artworkUrl}
              durationMs={props.current.info.duration}
              requesterName={props.current.requesterName}
              requesterAvatarUrl={props.current.requesterAvatarUrl}
              active
              leading={<PlayIcon className="size-3.5 text-brand" />}
            />
            {props.queue.length > 0 ? <Separator /> : null}
          </>
        ) : null}
        {props.queue.map((track, index) => (
          <div key={trackKey(track, String(index))}>
            {index > 0 ? <Separator /> : null}
            <TrackRow
              title={track.info.title ?? "Untitled"}
              subtitle={track.info.author ?? ""}
              artworkUrl={track.info.artworkUrl}
              indexLabel={String(index + 1).padStart(2, "0")}
              durationMs={track.info.duration}
              requesterName={track.requesterName}
              requesterAvatarUrl={track.requesterAvatarUrl}
              actions={
                <div
                  className={cn(
                    "flex items-center gap-0.5 opacity-0 transition-opacity",
                    "group-hover/row:opacity-100 group-focus-within/row:opacity-100",
                  )}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={index === 0 || props.queueBusy}
                        onClick={() => props.onMove(index, index - 1)}
                        aria-label="Move up"
                      >
                        <ArrowUpIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move up</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={
                          index >= props.queue.length - 1 || props.queueBusy
                        }
                        onClick={() => props.onMove(index, index + 1)}
                        aria-label="Move down"
                      >
                        <ArrowDownIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move down</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        disabled={props.queueBusy}
                        onClick={() => props.onRemove(index)}
                        aria-label="Remove"
                      >
                        <Trash2Icon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove</TooltipContent>
                  </Tooltip>
                </div>
              }
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function SearchPanel(props: QueueRailProps) {
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          if (!props.search.trim() || props.searchPending) {
            return
          }
          props.onSearch()
        }}
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={props.search}
            onChange={(event) => props.setSearch(event.target.value)}
            placeholder="Song name, artist, or paste a link"
            aria-label="Find a track"
            className="pl-9"
          />
        </div>
        <Button
          type="submit"
          disabled={!props.search.trim() || props.searchPending}
          className="shrink-0"
        >
          {props.searchPending ? "Searching…" : "Search"}
        </Button>
      </form>

      {props.searchTracks.length > 0 ? (
        <Card size="sm" className="gap-0 overflow-hidden py-0">
          <CardContent className="p-0">
            {props.searchTracks.slice(0, 8).map((track, index) => (
              <div key={track.encoded ?? `result-${String(index)}`}>
                {index > 0 ? <Separator /> : null}
                <TrackRow
                  title={track.info.title ?? "Untitled"}
                  subtitle={track.info.author ?? ""}
                  artworkUrl={track.info.artworkUrl}
                  indexLabel={String(index + 1).padStart(2, "0")}
                  actions={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        track.encoded && props.onAdd(track.encoded)
                      }
                      disabled={!track.encoded}
                    >
                      <PlusIcon data-icon="inline-start" />
                      Add
                    </Button>
                  }
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card
          size="sm"
          className="border border-dashed border-border bg-transparent py-0 shadow-none ring-0"
        >
          <CardContent className="px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              Find a song to drop in.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Paste a YouTube or SoundCloud link, or just type a song name.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
