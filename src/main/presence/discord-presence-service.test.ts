import assert from "node:assert/strict"
import test from "node:test"
import type { SetActivity } from "@xhayper/discord-rpc"
import type { PlayerState } from "../../shared/types/music"
import {
  buildDiscordActivity,
  buildTimestamps,
  DiscordPresenceService,
  type DiscordRpcSession,
} from "./discord-presence-service.ts"

function createPlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    status: "playing",
    queueItemId: "queue_1",
    title: "Midnight City",
    track: {
      title: "Midnight City",
      artist: "M83",
      album: "Hurry Up, We're Dreaming",
      durationMs: 250_000,
      thumbnailUrl: "https://example.com/cover.jpg",
      canonicalUrl: "https://example.com/track",
      provider: "youtube",
    },
    positionSeconds: 30,
    durationSeconds: 250,
    volume: 75,
    error: null,
    ...overrides,
  }
}

function createTrack(overrides: Partial<NonNullable<PlayerState["track"]>> = {}) {
  return {
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    durationMs: 250_000,
    thumbnailUrl: "https://example.com/cover.jpg",
    canonicalUrl: "https://example.com/track",
    provider: "youtube" as const,
    ...overrides,
  }
}

test("buildDiscordActivity includes playback metadata and button", () => {
  const activity = buildDiscordActivity(createPlayerState())
  assert.ok(activity)
  assert.equal(activity.details, "Midnight City")
  assert.equal(activity.state, "M83")
  assert.equal(activity.type, 2)
  assert.equal(activity.statusDisplayType, 2)
  assert.equal(activity.largeImageKey, "https://example.com/cover.jpg")
  assert.equal(activity.largeImageText, "Hurry Up, We're Dreaming")
  assert.equal(activity.detailsUrl, "https://example.com/track")
  assert.deepEqual(activity.buttons, [
    {
      label: "Search on Spotify",
      url: "https://open.spotify.com/search/artist%3AM83%20track%3AMidnight%20City?si",
    },
  ])
  assert.equal(typeof activity.startTimestamp, "number")
  assert.equal(typeof activity.endTimestamp, "number")
})

test("buildDiscordActivity omits subtitle when artist is missing", () => {
  const activity = buildDiscordActivity(
    createPlayerState({
      track: createTrack({
        artist: null,
        provider: "soundcloud",
      }),
    })
  )
  assert.ok(activity)
  assert.equal(activity.state, undefined)
})

test("buildDiscordActivity is inactive for paused playback", () => {
  const activity = buildDiscordActivity(
    createPlayerState({
      status: "paused",
    })
  )
  assert.equal(activity, null)
})

test("buildDiscordActivity is inactive while loading playback", () => {
  const activity = buildDiscordActivity(
    createPlayerState({
      status: "loading",
    })
  )
  assert.equal(activity, null)
})

test("buildDiscordActivity returns null for stopped playback", () => {
  const activity = buildDiscordActivity(
    createPlayerState({
      status: "idle",
      queueItemId: null,
      title: null,
      track: null,
    })
  )
  assert.equal(activity, null)
})

test("buildTimestamps recomputes start and end from current position", () => {
  const originalNow = Date.now
  Date.now = () => 1_700_000_000_000
  try {
    const timestamps = buildTimestamps(
      createPlayerState({
        positionSeconds: 45,
        durationSeconds: 120,
      })
    )
    assert.ok(timestamps)
    assert.equal(timestamps.start, 1_699_999_955_000)
    assert.equal(timestamps.end, 1_700_000_075_000)
  } finally {
    Date.now = originalNow
  }
})

test("buildDiscordActivity suppresses button when canonical URL is missing", () => {
  const activity = buildDiscordActivity(
    createPlayerState({
      track: createTrack({
        canonicalUrl: "",
      }),
    })
  )
  assert.ok(activity)
  assert.equal(activity.detailsUrl, undefined)
  assert.equal(activity.buttons, undefined)
})

test("buildDiscordActivity suppresses button when artist is missing", () => {
  const activity = buildDiscordActivity(
    createPlayerState({
      track: createTrack({
        artist: null,
      }),
    })
  )
  assert.ok(activity)
  assert.equal(activity.buttons, undefined)
})

test("DiscordPresenceService clears activity when disabled", async () => {
  const calls: string[] = []
  const session = createFakeSession(calls)
  const service = new DiscordPresenceService({
    applicationId: "app",
    enabled: true,
    createSession: () => session,
    reconnectDelayMs: 0,
  })

  service.sync(createPlayerState())
  await flush()
  service.setEnabled(false)
  await flush()

  assert.deepEqual(calls, ["connect", "set:Midnight City", "clear", "destroy"])
})

test("DiscordPresenceService reconnects and republishes after Discord becomes available", async () => {
  const calls: string[] = []
  let connectAttempts = 0
  const originalConsoleError = console.error
  console.error = () => {}
  const session = createFakeSession(calls, {
    connect: async () => {
      calls.push("connect")
      connectAttempts += 1
      if (connectAttempts === 1) {
        throw new Error("Discord not running")
      }
    },
  })
  const service = new DiscordPresenceService({
    applicationId: "app",
    enabled: true,
    createSession: () => session,
    reconnectDelayMs: 0,
  })

  try {
    service.sync(createPlayerState())
    await flush()
    await flush()

    assert.deepEqual(calls, ["connect", "connect", "set:Midnight City"])
  } finally {
    console.error = originalConsoleError
  }
})

test("DiscordPresenceService replaces activity on queue advance without stale metadata", async () => {
  const calls: string[] = []
  const session = createFakeSession(calls)
  const service = new DiscordPresenceService({
    applicationId: "app",
    enabled: true,
    createSession: () => session,
    reconnectDelayMs: 0,
  })

  service.sync(createPlayerState())
  await flush()
  service.sync(
    createPlayerState({
      title: "Oblivion",
      track: createTrack({
        title: "Oblivion",
        artist: "Grimes",
      }),
    })
  )
  await flush()

  assert.deepEqual(calls, ["connect", "set:Midnight City", "set:Oblivion"])
})

function createFakeSession(
  calls: string[],
  overrides: Partial<DiscordRpcSession> = {}
): DiscordRpcSession {
  return {
    connect: async () => {
      calls.push("connect")
    },
    setActivity: async (activity: SetActivity) => {
      calls.push(`set:${activity.details}`)
    },
    clearActivity: async () => {
      calls.push("clear")
    },
    destroy: async () => {
      calls.push("destroy")
    },
    onDisconnected: (_listener) => {},
    ...overrides,
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
}
