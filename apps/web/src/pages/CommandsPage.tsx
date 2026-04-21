import { useEffect, useMemo, useState } from "react"
import type { CommandCategory, CommandInfo, CommandOption } from "@loopify/protocol"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeftIcon, SearchIcon, XIcon } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchCommands } from "@/lib/api"
import { cn } from "@/lib/utils"

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
    <button
      type="button"
      onClick={() => onSelect(cmd.name)}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-lg border border-border bg-background p-4 text-left transition-colors",
        "hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
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
      <p className="text-sm leading-relaxed text-muted-foreground">
        {cmd.description || "No description."}
      </p>
      {cmd.options.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1.5">
          {cmd.options.map((o) => (
            <span
              key={o.name}
              className="inline-flex items-center gap-1 rounded-3xl border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground"
            >
              {o.name}
              {o.required ? <span className="text-destructive">*</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  )
}

function CommandDetail({
  cmd,
  onClose,
}: {
  cmd: CommandInfo
  onClose: () => void
}) {
  const reduceMotion = useReducedMotion()
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return (
    <motion.div
      key="commands-detail"
      className="fixed inset-0 z-50 flex items-stretch justify-end"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? undefined : { opacity: 0 }}
      transition={{ duration: 0.18 }}
      aria-modal="true"
      role="dialog"
    >
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
      />
      <motion.aside
        initial={reduceMotion ? false : { x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={reduceMotion ? undefined : { x: 32, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex h-full w-full max-w-xl flex-col gap-6 overflow-y-auto border-l border-border bg-background p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="capitalize">
              {CATEGORY_LABELS[cmd.category] ?? cmd.category}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close details"
          >
            <XIcon />
          </Button>
        </div>

        <div>
          <h2 className="font-mono text-3xl font-semibold tracking-tight text-foreground">
            /{cmd.name}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-muted-foreground">
            {cmd.description || "No description."}
          </p>
        </div>

        {cmd.options.length > 0 ? (
          <section>
            <h3 className="eyebrow">Options</h3>
            <dl className="mt-3 divide-y divide-border rounded-lg border border-border">
              {cmd.options.map((o) => {
                const hint = formatOption(o)
                return (
                  <div
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
                  </div>
                )
              })}
            </dl>
          </section>
        ) : null}

        {cmd.examples.length > 0 ? (
          <section>
            <h3 className="eyebrow">Examples</h3>
            <div className="mt-3 flex flex-col gap-2">
              {cmd.examples.map((ex) => (
                <code
                  key={ex}
                  className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm text-foreground"
                >
                  {ex}
                </code>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-auto pt-4">
          <Button variant="outline" onClick={onClose}>
            <ArrowLeftIcon data-icon="inline-start" />
            Back to all commands
          </Button>
        </div>
      </motion.aside>
    </motion.div>
  )
}

export function CommandsPage() {
  const reduceMotion = useReducedMotion()
  const params = useParams<{ name?: string }>()
  const navigate = useNavigate()
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
    if (!params.name) {
      return null
    }
    return commands.find((c) => c.name === params.name) ?? null
  }, [commands, params.name])

  useEffect(() => {
    if (params.name && state.status === "ready" && !selected) {
      navigate("/commands", { replace: true })
    }
  }, [params.name, selected, state.status, navigate])

  const closeDetail = () => navigate("/commands")

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
        <section className="rounded-lg border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          Could not load commands: {state.message}
        </section>
      ) : commands.length === 0 ? (
        <section className="rounded-lg border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          Loading the latest commands… (the bot may still be warming up).
        </section>
      ) : grouped.length === 0 ? (
        <section className="rounded-lg border border-border bg-muted/40 p-6 text-sm text-muted-foreground">
          No commands match “{query}”.
        </section>
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
                    onSelect={(name) => navigate(`/commands/${name}`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected ? (
          <CommandDetail cmd={selected} onClose={closeDetail} />
        ) : null}
      </AnimatePresence>

      <noscript>
        <ul>
          {commands.map((c) => (
            <li key={c.name}>
              <Link to={`/commands/${c.name}`}>/{c.name}</Link> — {c.description}
            </li>
          ))}
        </ul>
      </noscript>
    </div>
  )
}
