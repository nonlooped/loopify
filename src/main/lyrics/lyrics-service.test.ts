import assert from "node:assert/strict"
import test from "node:test"
import type { LyricsState, PlayerTrack } from "../../shared/types/music"
import type { LyricsCacheInput, LyricsCacheRepository } from "../db/repositories"
import { createLyricsCacheKey, LyricsService, parseLrc } from "./lyrics-service.ts"

const sampleTrack: PlayerTrack = {
  title: "I Want to Live",
  artist: "Borislav Slavov",
  album: "Baldur's Gate 3",
  durationMs: 233_000,
  thumbnailUrl: null,
  canonicalUrl: "https://example.com/track",
  provider: "youtube",
}

test("parseLrc parses standard timestamps and derives line ends", () => {
  const lines = parseLrc("[00:17.12] First line\n[01:02.004] Second line")
  assert.deepEqual(lines, [
    { timeSeconds: 17.12, endTimeSeconds: 62.004, text: "First line" },
    { timeSeconds: 62.004, endTimeSeconds: undefined, text: "Second line" },
  ])
})

test("parseLrc expands multiple timestamps on one line", () => {
  const lines = parseLrc("[00:01.00][00:03.50] Repeated")
  assert.deepEqual(
    lines.map((line) => ({ timeSeconds: line.timeSeconds, text: line.text })),
    [
      { timeSeconds: 1, text: "Repeated" },
      { timeSeconds: 3.5, text: "Repeated" },
    ]
  )
})

test("parseLrc ignores metadata, blanks, and malformed timestamps", () => {
  const lines = parseLrc("[ar:Artist]\n[00:02.00] \n[00:61.00] Bad\n[00:03.00] Good")
  assert.deepEqual(lines, [{ timeSeconds: 3, endTimeSeconds: undefined, text: "Good" }])
})

test("LyricsService returns cached lyrics without fetching", async () => {
  const cached: LyricsState = {
    status: "synced",
    reason: null,
    lyrics: {
      source: "cache",
      providerTrackId: "1",
      fetchedAt: 1,
      lines: [{ timeSeconds: 1, text: "Cached" }],
    },
  }
  const cache = createFakeCache(cached)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error("fetch should not run")
  }
  try {
    const service = new LyricsService(cache)
    assert.equal(await service.getForTrack(sampleTrack), cached)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("LyricsService falls back to static lyrics when sync data is missing", async () => {
  const cache = createFakeCache(null)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: 1,
        instrumental: false,
        plainLyrics: "Plain only",
        syncedLyrics: null,
      }),
      { status: 200 }
    )
  try {
    const service = new LyricsService(cache)
    const result = await service.getForTrack(sampleTrack)
    assert.equal(result.status, "static")
    assert.equal(result.reason, null)
    assert.equal(result.lyrics.text, "Plain only")
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("LyricsService searches for plain lyrics when exact lookup returns 404", async () => {
  const cache = createFakeCache(null)
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  globalThis.fetch = async (input) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    requests.push(url)

    if (url.startsWith("https://lrclib.net/api/get")) {
      return new Response(null, { status: 404 })
    }

    if (url.startsWith("https://lrclib.net/api/search")) {
      return new Response(
        JSON.stringify([
          {
            id: 10,
            trackName: sampleTrack.title,
            artistName: sampleTrack.artist,
            duration: 233,
            instrumental: false,
            plainLyrics: "Search result lyrics",
            syncedLyrics: null,
          },
        ]),
        { status: 200 }
      )
    }

    throw new Error(`Unexpected request: ${url}`)
  }
  try {
    const service = new LyricsService(cache)
    const result = await service.getForTrack(sampleTrack)
    assert.equal(result.status, "static")
    assert.equal(result.reason, null)
    assert.equal(result.lyrics.text, "Search result lyrics")
    assert.equal(requests.length, 2)
    assert.match(requests[0], /\/api\/get/)
    assert.match(requests[1], /\/api\/search/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("createLyricsCacheKey normalizes stable track identity", () => {
  assert.equal(
    createLyricsCacheKey(sampleTrack),
    createLyricsCacheKey({
      ...sampleTrack,
      title: "  I   WANT TO LIVE ",
      artist: "borislav slavov",
      album: "baldur's gate 3",
    })
  )
})

function createFakeCache(initial: LyricsState | null): LyricsCacheRepository {
  const state = { value: initial }
  return {
    get: () => state.value,
    set: (input: LyricsCacheInput) => {
      state.value = input.state
      return input.state
    },
  } as unknown as LyricsCacheRepository
}
