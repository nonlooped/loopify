import assert from "node:assert/strict"
import { cpSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import Database from "better-sqlite3"
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { LibraryRepository, SettingsRepository } from "../db/repositories"
import * as schema from "../db/schema"
import { RecommendationService } from "./recommendation-service"

type DrizzleDb = BetterSQLite3Database<typeof schema>

function createDrizzle(client: Database.Database): DrizzleDb {
  return drizzle({ client, schema })
}

function stableBucket(seed: string): number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000
  }
  return hash % 100
}

let rawDb: Database.Database
let db: ReturnType<typeof createDrizzle>
let tmpDir: string
let idCounter = 0

function setupTestDb(): void {
  idCounter = 0
  tmpDir = mkdtempSync(join(process.env.TEMP ?? "C:\\Temp", "loopify-test-"))
  const sourceMigrationsDir = join(import.meta.dirname, "..", "db", "migrations")
  const copiedMigrationsDir = join(tmpDir, "migrations")
  cpSync(sourceMigrationsDir, copiedMigrationsDir, { recursive: true })
  rawDb = new Database(":memory:")
  rawDb.pragma("journal_mode = WAL")
  rawDb.pragma("foreign_keys = ON")
  const drizzleDb = createDrizzle(rawDb)
  migrate(drizzleDb, { migrationsFolder: copiedMigrationsDir })
  db = drizzleDb
}

function teardownTestDb(): void {
  rawDb.close()
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

function insertTrack(
  trackId: string,
  overrides: {
    title?: string
    artist?: string
    likedAt?: number | null
    provider?: string
    canonicalUrl?: string
  } = {}
): void {
  const ts = Date.now()
  db.insert(schema.tracks)
    .values({
      id: trackId,
      title: overrides.title ?? `Track ${trackId}`,
      artist: overrides.artist ?? "Test Artist",
      album: null,
      artistId: null,
      albumId: null,
      durationMs: 180000,
      thumbnailUrl: null,
      canonicalUrl: overrides.canonicalUrl ?? `https://example.com/${trackId}`,
      provider: overrides.provider ?? "youtube",
      likedAt: overrides.likedAt ?? null,
      downloadStatus: "not-downloaded",
      downloadProgress: 0,
      downloadedFilePath: null,
      downloadError: null,
      downloadedAt: null,
      createdAt: ts,
      updatedAt: ts,
    })
    .run()
}

function insertPlayHistory(trackId: string, playedAt: number, completed = 0): void {
  db.insert(schema.playHistory)
    .values({
      id: `ph_${trackId}_${playedAt}`,
      trackId,
      sourceUrl: `https://example.com/${trackId}`,
      playedAt,
      completed,
    })
    .run()
}

function insertImpression(
  sessionId: string,
  trackId: string,
  position: number,
  shownAt: number
): void {
  idCounter++
  db.insert(schema.recommendationImpressions)
    .values({
      id: `reco_imp_${idCounter}`,
      sessionId,
      trackId,
      position,
      shownAt,
    })
    .run()
}

function insertInteraction(
  sessionId: string,
  trackId: string,
  interactionType: string,
  interactedAt: number
): void {
  idCounter++
  db.insert(schema.recommendationInteractions)
    .values({
      id: `reco_evt_${idCounter}`,
      sessionId,
      trackId,
      interactionType,
      interactedAt,
      metadataJson: null,
    })
    .run()
}

function insertPlaylist(trackId: string): string {
  const playlistId = "pl_test1"
  const ts = Date.now()
  db.insert(schema.playlists)
    .values({
      id: playlistId,
      name: "Test Playlist",
      description: null,
      sortOrder: 1,
      createdAt: ts,
      updatedAt: ts,
    })
    .run()
  db.insert(schema.playlistTracks)
    .values({
      id: "pt_test1",
      playlistId,
      trackId,
      sortOrder: 0,
      addedAt: ts,
      addedFrom: `https://example.com/${trackId}`,
    })
    .run()
  return playlistId
}

describe("stableBucket", () => {
  it("is deterministic for the same input", () => {
    const result1 = stableBucket("test-installation-id")
    const result2 = stableBucket("test-installation-id")
    assert.equal(result1, result2)
  })

  it("returns values in the range 0-99", () => {
    for (let i = 0; i < 100; i++) {
      const result = stableBucket(`seed-${i}-abcdefghijklmnopqrstuvwxyz`)
      assert.ok(result >= 0, `expected >= 0, got ${result}`)
      assert.ok(result < 100, `expected < 100, got ${result}`)
    }
  })

  it("returns different values for different inputs", () => {
    const values = new Set<number>()
    for (let i = 0; i < 100; i++) {
      values.add(stableBucket(`different-seed-${i}`))
    }
    assert.ok(values.size > 10, "Expected diverse bucket distribution")
  })

  it("handles empty string", () => {
    const result = stableBucket("")
    assert.ok(result >= 0 && result < 100, `expected 0-99, got ${result}`)
  })

  it("handles single character", () => {
    const result = stableBucket("a")
    assert.ok(result >= 0 && result < 100, `expected 0-99, got ${result}`)
  })
})

describe("RecommendationService", () => {
  describe("isEnabled", () => {
    it("returns false when recommendationsEnabled is false", () => {
      setupTestDb()
      try {
        const settings = new SettingsRepository(db)
        settings.update({ recommendationsEnabled: false, recommendationsRolloutPercent: 100 })
        const service = new RecommendationService(new LibraryRepository(db), settings)
        assert.equal(service.isEnabled(), false)
      } finally {
        teardownTestDb()
      }
    })

    it("returns true when enabled with 100% rollout", () => {
      setupTestDb()
      try {
        const settings = new SettingsRepository(db)
        settings.update({ recommendationsEnabled: true, recommendationsRolloutPercent: 100 })
        const service = new RecommendationService(new LibraryRepository(db), settings)
        assert.equal(service.isEnabled(), true)
      } finally {
        teardownTestDb()
      }
    })

    it("respects rollout percentage based on installationId bucket", () => {
      setupTestDb()
      try {
        const settings = new SettingsRepository(db)
        const installationId = "rollout-test-id"
        const bucket = stableBucket(installationId)
        settings.update({
          recommendationsEnabled: true,
          recommendationsRolloutPercent: bucket + 1,
          installationId,
        })
        const service = new RecommendationService(new LibraryRepository(db), settings)
        assert.equal(service.isEnabled(), true, `bucket=${bucket}, percent=${bucket + 1}`)

        settings.update({
          recommendationsEnabled: true,
          recommendationsRolloutPercent: bucket,
          installationId,
        })
        const cachedSettings = new SettingsRepository(db)
        assert.equal(
          new RecommendationService(new LibraryRepository(db), cachedSettings).isEnabled(),
          false,
          "Should be excluded when rollout percent equals bucket (< not <=)"
        )
      } finally {
        teardownTestDb()
      }
    })

    it("returns false when rollout percent is 0 even if enabled", () => {
      setupTestDb()
      try {
        const settings = new SettingsRepository(db)
        settings.update({ recommendationsEnabled: true, recommendationsRolloutPercent: 0 })
        const service = new RecommendationService(new LibraryRepository(db), settings)
        assert.equal(service.isEnabled(), false)
      } finally {
        teardownTestDb()
      }
    })
  })

  describe("getHomeRecommendations", () => {
    it("returns recommendations scored by play history", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)
        const settings = new SettingsRepository(db)
        settings.update({ recommendationsEnabled: true, recommendationsRolloutPercent: 100 })

        insertTrack("trk_a", { title: "Track A" })
        insertTrack("trk_b", { title: "Track B" })

        const now = Date.now()
        insertPlayHistory("trk_a", now - 1000, 1)
        insertPlayHistory("trk_a", now - 2000, 1)

        const service = new RecommendationService(library, settings)
        const result = service.getHomeRecommendations(10)

        assert.ok(result.sessionId.startsWith("reco_"), "session ID should have prefix")
        assert.ok(result.generatedAt > 0, "should have generatedAt timestamp")
        assert.ok(result.items.length >= 1, "should return at least 1 recommendation")

        const trackAItem = result.items.find((item) => item.track.id === "trk_a")
        assert.ok(trackAItem, "Track A should be in recommendations")
        assert.ok(trackAItem?.score > 0, "Track A should have a positive score")
      } finally {
        teardownTestDb()
      }
    })

    it("deduplicates recently shown tracks with low scores", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)
        const settings = new SettingsRepository(db)
        settings.update({ recommendationsEnabled: true, recommendationsRolloutPercent: 100 })

        insertTrack("trk_low", { title: "Low Score Track" })

        const now = Date.now()
        insertPlayHistory("trk_low", now - 1000, 0)

        insertImpression("session_old", "trk_low", 0, now)

        const service = new RecommendationService(library, settings)
        const result = service.getHomeRecommendations(10)
        const foundLow = result.items.find((item) => item.track.id === "trk_low")
        assert.ok(
          foundLow === undefined || foundLow.score >= 0.55,
          "Low-score recently shown track should be filtered"
        )
      } finally {
        teardownTestDb()
      }
    })

    it("limits results to the requested limit", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)
        const settings = new SettingsRepository(db)
        settings.update({ recommendationsEnabled: true, recommendationsRolloutPercent: 100 })

        for (let i = 0; i < 5; i++) {
          insertTrack(`trk_limit_${i}`, { title: `Track ${i}` })
          insertPlayHistory(`trk_limit_${i}`, Date.now() - i * 1000, 1)
        }

        const service = new RecommendationService(library, settings)
        const result = service.getHomeRecommendations(3)
        assert.ok(result.items.length <= 3, "Should not exceed limit")
      } finally {
        teardownTestDb()
      }
    })
  })

  describe("trackImpression and trackInteraction", () => {
    it("tracks an impression", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)
        const settings = new SettingsRepository(db)

        insertTrack("trk_imp")

        const service = new RecommendationService(library, settings)
        service.trackImpression("session_1", "trk_imp", 0)

        const impressions = db.select().from(schema.recommendationImpressions).all()
        assert.equal(impressions.length, 1)
        assert.equal(impressions[0].sessionId, "session_1")
        assert.equal(impressions[0].trackId, "trk_imp")
        assert.equal(impressions[0].position, 0)
      } finally {
        teardownTestDb()
      }
    })

    it("tracks an interaction", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)
        const settings = new SettingsRepository(db)

        insertTrack("trk_int")

        const service = new RecommendationService(library, settings)
        service.trackInteraction("session_1", "trk_int", "play")

        const interactions = db.select().from(schema.recommendationInteractions).all()
        assert.equal(interactions.length, 1)
        assert.equal(interactions[0].sessionId, "session_1")
        assert.equal(interactions[0].trackId, "trk_int")
        assert.equal(interactions[0].interactionType, "play")
      } finally {
        teardownTestDb()
      }
    })
  })

  describe("getMetrics", () => {
    it("returns zero metrics when no data exists", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)
        const settings = new SettingsRepository(db)

        const service = new RecommendationService(library, settings)
        const metrics = service.getMetrics()

        assert.equal(metrics.impressions, 0)
        assert.equal(metrics.plays, 0)
        assert.equal(metrics.likes, 0)
        assert.equal(metrics.saves, 0)
        assert.equal(metrics.skips, 0)
        assert.equal(metrics.ctr, 0)
        assert.equal(metrics.saveRate, 0)
        assert.equal(metrics.skipRate, 0)
      } finally {
        teardownTestDb()
      }
    })

    it("calculates metrics from impressions and interactions", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)
        const settings = new SettingsRepository(db)

        insertTrack("trk_m1")
        insertTrack("trk_m2")

        const now = Date.now()
        insertImpression("s1", "trk_m1", 0, now)
        insertImpression("s1", "trk_m2", 1, now)
        insertImpression("s2", "trk_m1", 0, now - 1000)

        insertInteraction("s1", "trk_m1", "play", now)
        insertInteraction("s1", "trk_m1", "like", now)
        insertInteraction("s1", "trk_m2", "skip", now)

        const service = new RecommendationService(library, settings)
        const metrics = service.getMetrics()

        assert.equal(metrics.impressions, 3)
        assert.equal(metrics.plays, 1)
        assert.equal(metrics.likes, 1)
        assert.equal(metrics.saves, 0)
        assert.equal(metrics.skips, 1)
        assert.ok(metrics.ctr > 0, "CTR should be positive")
        assert.equal(metrics.skipRate, 1 / 3)
      } finally {
        teardownTestDb()
      }
    })

    it("counts dismiss interactions as skips", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)
        const settings = new SettingsRepository(db)

        insertTrack("trk_d1")

        const now = Date.now()
        insertImpression("s1", "trk_d1", 0, now)
        insertInteraction("s1", "trk_d1", "dismiss", now)

        const service = new RecommendationService(library, settings)
        const metrics = service.getMetrics()

        assert.equal(metrics.skips, 1, "dismiss should count as skip")
        assert.equal(metrics.skipRate, 1)
      } finally {
        teardownTestDb()
      }
    })
  })

  describe("listRecommendationCandidates", () => {
    it("penalizes recently dismissed tracks", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)

        insertTrack("trk_good", { title: "Good Track" })
        insertTrack("trk_dismissed", { title: "Dismissed Track" })

        const now = Date.now()
        insertPlayHistory("trk_good", now - 1000, 1)
        insertPlayHistory("trk_good", now - 2000, 1)
        insertPlayHistory("trk_dismissed", now - 500, 1)

        insertInteraction("s1", "trk_dismissed", "dismiss", now)

        const results = library.listRecommendationCandidates(10)
        const dismissedEntry = results.find((r) => r.track.id === "trk_dismissed")
        if (dismissedEntry) {
          const goodEntry = results.find((r) => r.track.id === "trk_good")
          assert.ok(goodEntry, "Good track should be in results")
          assert.ok(
            goodEntry?.score > dismissedEntry?.score,
            "Good track should score higher than dismissed track"
          )
        }
      } finally {
        teardownTestDb()
      }
    })

    it("excludes tracks with no play history from the last 90 days", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)

        insertTrack("trk_played", { title: "Played Track" })
        insertTrack("trk_never", { title: "Never Played" })

        const now = Date.now()
        insertPlayHistory("trk_played", now - 1000, 1)

        const results = library.listRecommendationCandidates(10)
        const neverPlayed = results.find((r) => r.track.id === "trk_never")
        assert.equal(neverPlayed, undefined, "Track with no play history should not appear")
      } finally {
        teardownTestDb()
      }
    })

    it("limits each artist to at most 2 tracks", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)

        for (let i = 0; i < 4; i++) {
          insertTrack(`trk_same_artist_${i}`, {
            title: `Track ${i}`,
            artist: "Same Artist",
          })
          insertPlayHistory(`trk_same_artist_${i}`, Date.now() - i * 1000, 1)
        }

        const results = library.listRecommendationCandidates(10)
        const sameArtistCount = results.filter((r) => r.track.artist === "Same Artist").length
        assert.ok(
          sameArtistCount <= 2,
          `Expected at most 2 tracks per artist, got ${sameArtistCount}`
        )
      } finally {
        teardownTestDb()
      }
    })

    it("prefers tracks not already in user playlists for the discovery pool", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)

        insertTrack("trk_in_playlist", { title: "In Playlist" })
        insertTrack("trk_fresh", { title: "Fresh Track" })

        const now = Date.now()
        insertPlayHistory("trk_in_playlist", now - 1000, 1)
        insertPlayHistory("trk_fresh", now - 1000, 1)

        insertPlaylist("trk_in_playlist")

        const results = library.listRecommendationCandidates(10)
        const freshItem = results.find((r) => r.track.id === "trk_fresh")
        const playlistItem = results.find((r) => r.track.id === "trk_in_playlist")

        if (freshItem && playlistItem) {
          assert.ok(
            results.indexOf(freshItem) < results.indexOf(playlistItem) ||
              freshItem.score >= playlistItem.score,
            "Fresh track should be prioritized in discovery pool"
          )
        }
      } finally {
        teardownTestDb()
      }
    })

    it("produces correct reason strings based on signals", () => {
      setupTestDb()
      try {
        const library = new LibraryRepository(db)

        insertTrack("trk_liked", { title: "Liked Track", likedAt: Date.now() - 10000 })
        const now = Date.now()
        insertPlayHistory("trk_liked", now - 1000, 1)
        insertPlayHistory("trk_liked", now - 2000, 1)
        insertPlayHistory("trk_liked", now - 3000, 1)

        const results = library.listRecommendationCandidates(10)
        const likedItem = results.find((r) => r.track.id === "trk_liked")
        if (likedItem) {
          assert.ok(
            likedItem.reason === "A favorite of yours" ||
              likedItem.reason === "Replayed often" ||
              likedItem.reason === "Recently on repeat",
            `Expected a known reason, got "${likedItem.reason}"`
          )
        }
      } finally {
        teardownTestDb()
      }
    })
  })
})
