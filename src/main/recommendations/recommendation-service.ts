import type {
  HomeRecommendations,
  RecommendationInteractionType,
  RecommendationMetrics,
} from "../../shared/contracts/ipc"
import type { LibraryRepository, SettingsRepository } from "../db/repositories"

export class RecommendationService {
  constructor(
    private readonly library: LibraryRepository,
    private readonly settings: SettingsRepository
  ) {}

  isEnabled(): boolean {
    const settings = this.settings.get()
    if (!settings.recommendationsEnabled) return false
    if (settings.recommendationsRolloutPercent >= 100) return true
    const bucket = stableBucket(settings.installationId)
    return bucket < settings.recommendationsRolloutPercent
  }

  getHomeRecommendations(limit = 12): HomeRecommendations {
    const parsedLimit = Math.max(1, Math.min(limit, 48))
    const candidates = this.library.listRecommendationCandidates(parsedLimit)
    const generatedAt = Date.now()
    const sessionId = `reco_${generatedAt.toString(36)}`
    return {
      sessionId,
      generatedAt,
      items: candidates.map((c, index) => ({
        track: c.track,
        score: Math.max(0.01, c.score * (1 - index * 0.03)),
        reason: c.reason,
      })),
    }
  }

  trackImpression(sessionId: string, trackId: string, position: number): void {
    this.library.trackRecommendationImpression({
      sessionId,
      trackId,
      position,
      shownAt: Date.now(),
    })
  }

  trackInteraction(
    sessionId: string,
    trackId: string,
    type: RecommendationInteractionType,
    metadata?: string
  ): void {
    this.library.trackRecommendationInteraction({
      sessionId,
      trackId,
      interactionType: type,
      interactedAt: Date.now(),
      metadataJson: metadata ?? null,
    })
  }

  getMetrics(): RecommendationMetrics {
    return this.library.getRecommendationMetrics(24 * 7)
  }
}

function stableBucket(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000
  }
  return hash % 100
}
