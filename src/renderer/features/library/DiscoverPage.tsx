import {
  Compass,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { HomeRecommendations, RecommendationItem } from "src/shared/contracts/ipc"
import type { Track } from "src/shared/types/music"
import { Button } from "@/components/Button"
import { IconButton } from "@/components/IconButton"
import { cn } from "@/lib/cn"
import { useAppStore } from "@/stores/app.store"
import { CompactDiscoverList, DiscoverSection } from "./DiscoverSection"

const VIBES = [
  { id: "all", label: "All", keywords: [] as string[] },
  { id: "chill", label: "Chill", keywords: ["chill", "slow", "acoustic", "soft", "calm", "relax"] },
  { id: "hype", label: "Hype", keywords: ["hype", "energy", "fast", "hard", "intense", "banger"] },
  {
    id: "late-night",
    label: "Late night",
    keywords: ["night", "dark", "sleep", "dream", "midnight"],
  },
  { id: "focus", label: "Focus", keywords: ["focus", "instrumental", "ambient", "study", "work"] },
  { id: "sad", label: "Sad", keywords: ["sad", "melancholy", "slow", "emotional", "cry", "tears"] },
  { id: "happy", label: "Happy", keywords: ["happy", "upbeat", "pop", "bright", "joy", "smile"] },
  { id: "romantic", label: "Romantic", keywords: ["love", "romantic", "heart", "date", "kiss"] },
  {
    id: "workout",
    label: "Workout",
    keywords: ["workout", "gym", "energy", "pump", "run", "lift"],
  },
] as const

type VibeId = (typeof VIBES)[number]["id"]

function matchesVibe(item: RecommendationItem, vibeId: VibeId): boolean {
  if (vibeId === "all") return true
  const vibe = VIBES.find((v) => v.id === vibeId)
  if (!vibe) return true
  const haystack =
    `${item.track.title} ${item.track.artist ?? ""} ${item.track.album ?? ""} ${item.reason}`.toLowerCase()
  return vibe.keywords.some((k) => haystack.includes(k))
}

function classifySections(items: RecommendationItem[]): {
  picksForYou: RecommendationItem[]
  replayFavorites: RecommendationItem[]
  hiddenGems: RecommendationItem[]
  trending: RecommendationItem[]
} {
  const picksForYou: RecommendationItem[] = []
  const replayFavorites: RecommendationItem[] = []
  const hiddenGems: RecommendationItem[] = []
  const trending: RecommendationItem[] = []

  for (const item of items) {
    if (item.track.likedAt) {
      replayFavorites.push(item)
      continue
    }
    if (item.reason.includes("hidden gem") || item.score > 0.65) {
      hiddenGems.push(item)
      continue
    }
    if (item.score > 0.5) {
      trending.push(item)
      continue
    }
    picksForYou.push(item)
  }

  trending.sort((a, b) => b.score - a.score)

  return { picksForYou, replayFavorites, hiddenGems, trending }
}

function DiscoverRecommendationsDisabled() {
  const toggleSettings = useAppStore((s) => s.toggleSettings)

  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-full max-w-md rounded-2xl border border-border/50 bg-raised/80 p-8 shadow-lg">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <Sparkles className="h-7 w-7" aria-hidden />
        </div>
        <h2 className="type-title text-foreground">Discover is off</h2>
        <p className="type-body-sm mt-3 text-muted leading-relaxed">
          Smart recommendations are disabled for this installation (or outside the rollout). Turn
          them on in Settings to see personalized picks and discovery sections here.
        </p>
        <Button type="button" size="md" className="mt-8 gap-2" onClick={() => toggleSettings(true)}>
          <Settings className="h-4 w-4" aria-hidden />
          Open Settings
        </Button>
      </div>
    </div>
  )
}

export function DiscoverPage() {
  const recommendationsEnabled = useAppStore((s) => s.recommendationsEnabled)
  const [data, setData] = useState<HomeRecommendations | null>(null)
  const [loading, setLoading] = useState(recommendationsEnabled)
  const [error, setError] = useState<string | null>(null)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set())
  const [activeVibe, setActiveVibe] = useState<VibeId>("all")

  const setDiscoverRecommendationContext = useAppStore((s) => s.setDiscoverRecommendationContext)
  const trackRecommendationInteraction = useAppStore((s) => s.trackRecommendationInteraction)
  const refreshRecommendations = useAppStore((s) => s.refreshRecommendations)
  const handlePlayTrack = useAppStore((s) => s.handlePlayTrack)
  const handleEnqueuePlaylistTrack = useAppStore((s) => s.handleEnqueuePlaylistTrack)
  const handleToggleLikeTrack = useAppStore((s) => s.handleToggleLikeTrack)

  const vibeRef = useRef<HTMLDivElement>(null)
  const trendingRef = useRef<HTMLDivElement>(null)
  const discoverLoadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++discoverLoadSeq.current
    try {
      setLoading(true)
      setError(null)
      const recs = await window.loopify.recommendations.getHome(36)
      if (seq !== discoverLoadSeq.current) return
      setData(recs)
      setDiscoverRecommendationContext(
        recs.sessionId,
        recs.items.map((item) => item.track.id)
      )
      Promise.allSettled(
        recs.items.map((item, i) =>
          window.loopify.recommendations.trackImpression({
            sessionId: recs.sessionId,
            trackId: item.track.id,
            position: i,
          })
        )
      ).catch(() => {})
    } catch (err) {
      if (seq !== discoverLoadSeq.current) return
      setDiscoverRecommendationContext(null)
      setError(err instanceof Error ? err.message : "Failed to load discover content")
    } finally {
      if (seq === discoverLoadSeq.current) {
        setLoading(false)
      }
    }
  }, [setDiscoverRecommendationContext])

  useEffect(() => {
    return () => {
      discoverLoadSeq.current += 1
      setDiscoverRecommendationContext(null)
    }
  }, [setDiscoverRecommendationContext])

  useEffect(() => {
    if (!recommendationsEnabled) {
      discoverLoadSeq.current += 1
      setDiscoverRecommendationContext(null)
      setData(null)
      setError(null)
      setDismissedIds(new Set())
      setLoading(false)
      return
    }
    void load()
  }, [recommendationsEnabled, load, setDiscoverRecommendationContext])

  const handleDismiss = async (track: Track) => {
    setDismissedIds((prev) => new Set(prev).add(track.id))
    void trackRecommendationInteraction(track.id, "dismiss")
  }

  const handleRefresh = async () => {
    await load()
    await refreshRecommendations()
  }

  const handleShuffleSomethingNew = () => {
    const all = effectiveItems
    if (all.length === 0) return
    const random = all[Math.floor(Math.random() * all.length)]
    void handlePlayTrack(random.track)
  }

  const handlePlayRandomGem = () => {
    if (hiddenGems.length === 0) return
    const random = hiddenGems[Math.floor(Math.random() * hiddenGems.length)]
    void handlePlayTrack(random.track)
  }

  const scrollToVibes = () => {
    vibeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const scrollToTrending = () => {
    trendingRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  if (!recommendationsEnabled) {
    return <DiscoverRecommendationsDisabled />
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="type-body text-muted">{error}</p>
        <Button type="button" onClick={handleRefresh}>
          Retry
        </Button>
      </div>
    )
  }

  const allItems = data?.items ?? []
  const effectiveItems = allItems.filter((item) => !dismissedIds.has(item.track.id))
  const filteredItems = effectiveItems.filter((item) => matchesVibe(item, activeVibe))

  const { picksForYou, replayFavorites, hiddenGems, trending } = classifySections(filteredItems)

  const featured = picksForYou[0]
  const remainingPicks = picksForYou.slice(1)

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pb-12">
      {/* Header */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="type-heading text-foreground">Discover</h1>
          <p className="type-meta mt-1 text-muted">Find your next favorite track.</p>
        </div>
        <Button type="button" variant="ghost" size="md" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickActionCard
          icon={<Shuffle className="h-5 w-5" />}
          title="Shuffle something new"
          subtitle="Surprise me"
          onClick={handleShuffleSomethingNew}
        />
        <QuickActionCard
          icon={<TrendingUp className="h-5 w-5" />}
          title="Trending now"
          subtitle="What's hot"
          onClick={scrollToTrending}
        />
        <QuickActionCard
          icon={<Compass className="h-5 w-5" />}
          title="Explore by mood"
          subtitle="Find the vibe"
          onClick={scrollToVibes}
        />
        <QuickActionCard
          icon={<Zap className="h-5 w-5" />}
          title="Play a random hidden gem"
          subtitle="Discover more"
          onClick={handlePlayRandomGem}
        />
      </div>

      {/* Vibe Filters */}
      <div ref={vibeRef} className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="type-label text-foreground">Filter by vibe</h2>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {VIBES.map((vibe) => (
            <button
              key={vibe.id}
              type="button"
              onClick={() => setActiveVibe(vibe.id)}
              className={cn(
                "type-label shrink-0 cursor-pointer rounded-full px-4 py-2 transition-all duration-ui ease-out-quart active:scale-95 motion-reduce:active:scale-100",
                activeVibe === vibe.id
                  ? "bg-accent text-on-accent"
                  : "bg-white/5 text-foreground hover:bg-white/10"
              )}
            >
              {vibe.label}
            </button>
          ))}
        </div>
      </div>

      {/* Featured */}
      {featured && (
        <div className="mb-12">
          <div className="type-meta mb-3 flex items-center gap-2 text-accent">
            <Sparkles className="h-3.5 w-3.5" />
            Featured for you
          </div>
          <div className="group relative overflow-hidden rounded-2xl bg-raised">
            <div className="flex flex-col sm:flex-row">
              <div className="relative h-52 w-full shrink-0 overflow-hidden sm:h-auto sm:w-64 md:w-80">
                {featured.track.thumbnailUrl ? (
                  <img
                    src={featured.track.thumbnailUrl}
                    alt={featured.track.title}
                    className="h-full w-full object-cover transition-transform duration-ui ease-out-quart group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Sparkles className="h-12 w-12 text-muted" />
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-ui ease-out-quart group-hover:bg-black/25 group-hover:opacity-100 motion-reduce:group-hover:opacity-0">
                  <IconButton
                    size="lg"
                    title="Play"
                    className="h-14 w-14 rounded-full bg-accent text-on-accent hover:bg-accent-bright"
                    onClick={() => {
                      void handlePlayTrack(featured.track)
                    }}
                  >
                    <Play className="ml-0.5 h-6 w-6 fill-current" />
                  </IconButton>
                </div>
              </div>
              <div className="flex flex-1 flex-col justify-center p-6 sm:p-8">
                <h2 className="type-title mb-1 text-foreground">{featured.track.title}</h2>
                <p className="type-body-sm text-muted">
                  {featured.track.artist ?? "Unknown artist"}
                  {featured.track.album ? ` — ${featured.track.album}` : ""}
                </p>
                <span className="type-meta mt-3 inline-block w-fit rounded-full bg-accent/10 px-2.5 py-1 text-accent">
                  {featured.reason}
                </span>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button
                    size="md"
                    className="gap-2"
                    onClick={() => {
                      void handlePlayTrack(featured.track)
                    }}
                  >
                    <Play className="h-4 w-4 fill-current" />
                    Play
                  </Button>
                  <Button
                    variant="ghost"
                    size="md"
                    className="gap-2"
                    onClick={() => {
                      void handleEnqueuePlaylistTrack(featured.track)
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    Add to Queue
                  </Button>
                  <IconButton
                    size="md"
                    title={featured.track.likedAt ? "Unlike" : "Like"}
                    active={!!featured.track.likedAt}
                    onClick={() => {
                      void handleToggleLikeTrack(featured.track)
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill={featured.track.likedAt ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                      role="img"
                      aria-label={featured.track.likedAt ? "Unlike" : "Like"}
                    >
                      <title>{featured.track.likedAt ? "Unlike" : "Like"}</title>
                      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    </svg>
                  </IconButton>
                  <IconButton
                    size="md"
                    title="Not interested"
                    onClick={() => handleDismiss(featured.track)}
                  >
                    <X className="h-5 w-5" />
                  </IconButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Made for you */}
      {remainingPicks.length > 0 && (
        <DiscoverSection
          title="Made for you"
          subtitle="Personalized for your taste"
          items={remainingPicks}
          onDismiss={handleDismiss}
        />
      )}

      {/* Trending now */}
      <div ref={trendingRef}>
        {trending.length > 0 && (
          <DiscoverSection
            title="Trending now"
            subtitle="What people are listening to right now"
            items={trending}
            onDismiss={handleDismiss}
          />
        )}
      </div>

      {/* Replay favorites */}
      {replayFavorites.length > 0 && (
        <DiscoverSection
          title="Replay your favorites"
          subtitle="Songs you have loved"
          items={replayFavorites}
          onDismiss={handleDismiss}
        />
      )}

      {/* Hidden gems */}
      {hiddenGems.length > 0 && (
        <DiscoverSection
          title="Hidden gems"
          subtitle="Overlooked tracks worth another listen"
          items={hiddenGems}
          onDismiss={handleDismiss}
        />
      )}

      {/* Bottom compact lists */}
      {(hiddenGems.length > 0 || remainingPicks.length > 0 || trending.length > 0) && (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {hiddenGems.length > 0 && (
            <CompactDiscoverList
              title="Hidden gems"
              subtitle="Underrated tracks you might've missed"
              items={hiddenGems.slice(0, 4)}
              onDismiss={handleDismiss}
            />
          )}
          {remainingPicks.length > 0 && (
            <CompactDiscoverList
              title="Recently discovered"
              subtitle="Pick up where you left off"
              items={remainingPicks.slice(0, 4)}
              onDismiss={handleDismiss}
            />
          )}
          {trending.length > 0 && (
            <CompactDiscoverList
              title="New this week"
              subtitle="Fresh drops every week"
              items={trending.slice(0, 4)}
              onDismiss={handleDismiss}
            />
          )}
        </div>
      )}

      {filteredItems.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="type-title text-foreground">Nothing here yet</p>
          <p className="type-body-sm mt-2 max-w-xs text-muted">
            {activeVibe !== "all"
              ? "Try a different vibe filter to discover more tracks."
              : "Listen to more tracks or dismiss fewer to build your personalized discover feed."}
          </p>
          <Button type="button" onClick={handleRefresh} className="mt-6">
            Refresh
          </Button>
        </div>
      )}
    </div>
  )
}

function QuickActionCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-4 rounded-xl bg-raised p-4 text-left transition-all duration-ui ease-out-quart hover:bg-white/[0.04] active:scale-[0.98] motion-reduce:active:scale-100"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="type-label text-foreground">{title}</p>
        <p className="type-meta text-muted">{subtitle}</p>
      </div>
    </button>
  )
}
