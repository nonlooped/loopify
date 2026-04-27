import assert from "node:assert/strict"
import test from "node:test"
import type { CatalogTrack } from "../../shared/types/music.ts"
import { MATCH_THRESHOLD, pickBestMatch, scoreEntry } from "./youtube-source-matcher.ts"

function makeCatalog(overrides: Partial<CatalogTrack> = {}): CatalogTrack {
  return {
    catalogProvider: "itunes",
    catalogId: "1",
    title: "Mirage",
    artist: "Creepy Nuts",
    album: null,
    artworkUrl: null,
    durationMs: 139000,
    isrc: null,
    ...overrides,
  }
}

test("Topic channel with matching duration scores above threshold", () => {
  const catalog = makeCatalog()
  const entry = {
    id: "abc12345678",
    title: "Mirage",
    uploader: "Creepy Nuts - Topic",
    duration: 139,
    webpage_url: "https://www.youtube.com/watch?v=abc12345678",
  }
  const score = scoreEntry(entry, catalog)
  assert.ok(score >= MATCH_THRESHOLD, `expected score >= ${MATCH_THRESHOLD}, got ${score}`)
})

test("Live version is down-ranked", () => {
  const catalog = makeCatalog()
  const live = {
    id: "live12345678",
    title: "Mirage (Live at Budokan)",
    uploader: "Creepy Nuts",
    duration: 145,
    webpage_url: "https://www.youtube.com/watch?v=live12345678",
  }
  const score = scoreEntry(live, catalog)
  assert.ok(score < MATCH_THRESHOLD, `live version should be below threshold, got ${score}`)
})

test("Wrong song is rejected even if uploader matches", () => {
  const catalog = makeCatalog()
  const wrong = {
    id: "wrongsong123",
    title: "Bling-Bang-Bang-Born",
    uploader: "Creepy Nuts - Topic",
    duration: 173,
    webpage_url: "https://www.youtube.com/watch?v=wrongsong123",
  }
  const score = scoreEntry(wrong, catalog)
  assert.ok(score < MATCH_THRESHOLD, `wrong song should be below threshold, got ${score}`)
})

test("pickBestMatch prefers Topic channel over official music video", () => {
  const catalog = makeCatalog()
  const entries = [
    {
      id: "officialvid1",
      title: "Creepy Nuts - Mirage (Official Music Video)",
      uploader: "CreepyNutsOfficial",
      duration: 139,
      webpage_url: "https://www.youtube.com/watch?v=officialvid1",
    },
    {
      id: "topic1234567",
      title: "Mirage",
      uploader: "Creepy Nuts - Topic",
      duration: 139,
      webpage_url: "https://www.youtube.com/watch?v=topic1234567",
    },
  ]
  const best = pickBestMatch(entries, catalog)
  assert.ok(best !== null, "should find a match")
  assert.equal(best.entry.id, "topic1234567", "Topic channel should win")
})

test("pickBestMatch returns null when no entry clears the threshold", () => {
  const catalog = makeCatalog()
  const entries = [
    {
      id: "remix1234567",
      title: "Mirage (Sped Up Remix)",
      uploader: "SomeChannel",
      duration: 90,
      webpage_url: "https://www.youtube.com/watch?v=remix1234567",
    },
  ]
  const best = pickBestMatch(entries, catalog)
  assert.equal(best, null, "sped-up short remix should not match")
})

test("Remix penalty suppressed when catalog title contains remix", () => {
  const catalog = makeCatalog({ title: "Mirage (Remix)", durationMs: 200000 })
  const entry = {
    id: "remix1234567",
    title: "Creepy Nuts - Mirage (Remix)",
    uploader: "Creepy Nuts - Topic",
    duration: 200,
    webpage_url: "https://www.youtube.com/watch?v=remix1234567",
  }
  const score = scoreEntry(entry, catalog)
  assert.ok(score >= MATCH_THRESHOLD, `remix penalty should be suppressed, got ${score}`)
})

test("Official audio tag improves score over untagged upload", () => {
  const catalog = makeCatalog()
  const untagged = {
    id: "untagged12345",
    title: "Mirage",
    uploader: "SomeRandomChannel",
    duration: 139,
    webpage_url: "https://www.youtube.com/watch?v=untagged12345",
  }
  const tagged = {
    id: "tagged1234567",
    title: "Mirage (Official Audio)",
    uploader: "SomeRandomChannel",
    duration: 139,
    webpage_url: "https://www.youtube.com/watch?v=tagged1234567",
  }
  const scoreUntagged = scoreEntry(untagged, catalog)
  const scoreTagged = scoreEntry(tagged, catalog)
  assert.ok(scoreTagged > scoreUntagged, "official audio tag should yield higher score")
})
