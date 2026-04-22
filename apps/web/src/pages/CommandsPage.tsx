import { useEffect, useMemo, useState } from "react"
import type {
  CommandCategory,
  CommandInfo,
  CommandOption,
} from "@/lib/contracts"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeftIcon, SearchIcon } from "lucide-react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchCommands } from "@/lib/api"

const CATEGORY_ORDER: readonly CommandCategory[] = [
  "playback",
  "queue",
  "voice",
  "info",
  "other",
] as const

const CATEGORY_LABELS: Record<CommandCategory, string> = {
  playback: "Playback",
  queue: "Queue",
  voice: "Voice",
  info: "Info",
  other: "Other",
}

const CATEGORY_BLURBS: Record<CommandCategory, string> = {
  playback: "Control what's playing right now.",
  queue: "Shape the lineup of upcoming tracks.",
  voice: "Join and manage voice channels.",
  info: "Get help and learn about the bot.",
  other: "Everything else.",
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; commands: CommandInfo[] }
  | { status: "error"; message: string }

let commandsCache: CommandInfo[] | null = null

function matchesQuery(cmd: CommandInfo, q: string): boolean {
  if (!q) {
    return true
  }
  const needle = q.toLowerCase()
  if (cmd.name.toLowerCase().includes(needle)) {
    return true
  }
  if (cmd.description.toLowerCase().includes(needle)) {
    return true
  }
  return cmd.options.some(
    (o) =>
      o.name.toLowerCase().includes(needle) ||
      o.description.toLowerCase().includes(needle),
  )
}

function formatOption(o: CommandOption): string {
  const parts: string[] = []
  if (o.minValue !== undefined || o.maxValue !== undefined) {
    const lo = o.minValue ?? "…"
    const hi = o.maxValue ?? "…"
    parts.push(`${lo}–${hi}`)
  }
  if (o.choices && o.choices.length > 0) {
    parts.push(o.choices.map((c) => String(c.value)).join(" | "))
  }
  return parts.join(", ")
}

function CommandRow({
  cmd,
  onSelect,
}: {
  cmd: CommandInfo
  onSelect: (name: string) => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onSelect(cmd.name)}
      className="group h-auto w-full flex-col items-stretch gap-2 rounded-lg p-4 text-left whitespace-normal"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">
            /{cmd.name}
          </span>
          {cmd.options.some((o) => o.required) ? (
            <Badge variant="outline" className="font-mono text-[0.65rem]">
              args
            </Badge>
          ) : null}
        </div>
      </div>
      <p className="text-sm leading-relaxed font-normal text-muted-foreground">
        {cmd.description || "No description."}
      </p>
      {cmd.options.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {cmd.options.map((o) => (
            <Badge
              key={o.name}
              variant="outline"
              className="gap-1 bg-muted/40 font-mono text-[0.65rem] font-normal text-muted-foreground"
            >
              {o.name}
              {o.required ? <span className="text-destructive">*</span> : null}
            </Badge>
          ))}
        </div>
      ) : null}
    </Button>
  )
}

function CommandDetail({
  cmd,
  open,
  onClose,
}: {
  cmd: CommandInfo | null
  open: boolean
  onClose: () => void
}) {
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
        side="right"
        className="flex w-full max-w-xl flex-col gap-6 overflow-y-auto bg-background p-6 text-foreground sm:max-w-xl sm:p-8"
      >
        {cmd ? (
          <>
            <SheetHeader className="p-0">
              <Badge variant="outline" className="w-fit capitalize">
                {CATEGORY_LABELS[cmd.category] ?? cmd.category}
              </Badge>
              <SheetTitle className="font-mono text-3xl font-semibold tracking-tight text-foreground">
                /{cmd.name}
              </SheetTitle>
              <SheetDescription className="text-base leading-relaxed text-muted-foreground">
                {cmd.description || "No description."}
              </SheetDescription>
            </SheetHeader>

            {cmd.options.length > 0 ? (
              <section>
                <h3 className="eyebrow">Options</h3>
                <Card className="mt-3 gap-0 py-0">
                  <CardContent className="divide-y divide-border p-0">
                    {cmd.options.map((o) => {
                      const hint = formatOption(o)
                      return (
                        <dl
                          key={o.name}
                          className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,10rem)_1fr] sm:items-start"
                        >
                          <dt className="flex items-center gap-2">
                            <span className="font-mono text-sm text-foreground">
                              {o.name}
                            </span>
                            {o.required ? (
                              <Badge
                                variant="outline"
                                className="border-destructive/40 text-destructive"
                              >
                                required
                              </Badge>
                            ) : (
                              <Badge variant="outline">optional</Badge>
                            )}
                          </dt>
                          <dd className="text-sm leading-relaxed text-muted-foreground">
                            <p>{o.description}</p>
                            {hint ? (
                              <p className="mt-1 font-mono text-[0.75rem] text-muted-foreground/70">
                                {hint}
                              </p>
                            ) : null}
                          </dd>
                        </dl>
                      )
                    })}
                  </CardContent>
                </Card>
              </section>
            ) : null}

            {cmd.examples.length > 0 ? (
              <section>
                <h3 className="eyebrow">Examples</h3>
                <Card className="mt-3 gap-0 py-0">
                  <CardContent className="flex flex-col divide-y divide-border p-0">
                    {cmd.examples.map((ex) => (
                      <code
                        key={ex}
                        className="px-3 py-2 font-mono text-sm text-foreground"
                      >
                        {ex}
                      </code>
                    ))}
                  </CardContent>
                </Card>
              </section>
            ) : null}

            <div className="mt-auto pt-4">
              <Button variant="outline" onClick={onClose}>
                <ArrowLeftIcon data-icon="inline-start" />
                Back to all commands
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

export function CommandsPage() {
  const reduceMotion = useReducedMotion()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const selectedCmd = searchParams.get("cmd")
  const [state, setState] = useState<LoadState>(
    commandsCache
      ? { status: "ready", commands: commandsCache }
      : { status: "loading" },
  )
  const [query, setQuery] = useState("")

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchCommands()
        .then((r) => {
          commandsCache = r.commands
          if (!cancelled) {
            setState({ status: "ready", commands: r.commands })
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setState({
              status: "error",
              message: err instanceof Error ? err.message : String(err),
            })
          }
        })
    }
    load()
    const onFocus = () => {
      if (!commandsCache || commandsCache.length === 0) {
        load()
      }
    }
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  const commands =
    state.status === "ready" ? state.commands : ([] as CommandInfo[])

  const grouped = useMemo(() => {
    const filtered = commands.filter((c) => matchesQuery(c, query))
    const byCat = new Map<CommandCategory, CommandInfo[]>()
    for (const c of filtered) {
      const list = byCat.get(c.category) ?? []
      list.push(c)
      byCat.set(c.category, list)
    }
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: (byCat.get(cat) ?? []).slice().sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    })).filter((g) => g.items.length > 0)
  }, [commands, query])

  const selected = useMemo(() => {
    if (!selectedCmd) {
      return null
    }
    return commands.find((c) => c.name === selectedCmd) ?? null
  }, [commands, selectedCmd])

  useEffect(() => {
    if (selectedCmd && state.status === "ready" && !selected) {
      navigate("/commands", { replace: true })
    }
  }, [selectedCmd, selected, state.status, navigate])

  const openCommand = (name: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set("cmd", name)
        return next
      },
      { replace: searchParams.has("cmd") },
    )
  }

  const closeDetail = () => {
    if (!searchParams.has("cmd")) {
      return
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete("cmd")
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-col gap-10 lg:gap-14">
      <motion.section
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
        className="max-w-3xl"
      >
        <p className="eyebrow">Commands</p>
        <h1 className="section-display mt-5 text-balance">
          Every slash command at a glance.
        </h1>
        <p className="mt-5 max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">
          Browse what Loopify can do in Discord. Pick a command to see its
          options, valid ranges, and usage examples.
        </p>
      </motion.section>

      <section className="flex flex-col gap-3">
        <label htmlFor="commands-search" className="eyebrow">
          Find a command
        </label>
        <div className="relative max-w-md">
          <SearchIcon
            aria-hidden
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="commands-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, option, or description…"
            className="pl-9"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </section>

      {state.status === "loading" ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <Skeleton key={k} className="h-28 w-full rounded-lg" />
          ))}
        </section>
      ) : state.status === "error" ? (
        <Card size="sm">
          <CardContent className="text-sm text-muted-foreground">
            Could not load commands: {state.message}
          </CardContent>
        </Card>
      ) : commands.length === 0 ? (
        <Card size="sm">
          <CardContent className="text-sm text-muted-foreground">
            Loading the latest commands… (the bot may still be warming up).
          </CardContent>
        </Card>
      ) : grouped.length === 0 ? (
        <Card size="sm">
          <CardContent className="text-sm text-muted-foreground">
            No commands match “{query}”.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-12">
          {grouped.map((g) => (
            <section key={g.category} className="flex flex-col gap-5">
              <header className="flex flex-col gap-1 border-b border-border pb-3">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">
                  {CATEGORY_LABELS[g.category]}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {CATEGORY_BLURBS[g.category]}
                </p>
              </header>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((cmd) => (
                  <CommandRow
                    key={cmd.name}
                    cmd={cmd}
                    onSelect={openCommand}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <CommandDetail
        cmd={selected}
        open={Boolean(selected)}
        onClose={closeDetail}
      />

      <noscript>
        <ul>
          {commands.map((c) => (
            <li key={c.name}>
              <Link to={{ pathname: "/commands", search: `?${new URLSearchParams({ cmd: c.name }).toString()}` }}>
                /{c.name}
              </Link>{" "}
              — {c.description}
            </li>
          ))}
        </ul>
      </noscript>
    </div>
  )
}
