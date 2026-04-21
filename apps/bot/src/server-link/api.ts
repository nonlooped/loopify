import type { PlayerSnapshot } from '@loopify/protocol'

import { assertRequiredEnv } from '../config/env.js'

function baseUrl() {
  return assertRequiredEnv('MUSIC_SERVER_URL').replace(/\/$/, '')
}

function token() {
  return assertRequiredEnv('INTERNAL_API_TOKEN')
}

async function req(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

export async function pingMusicServer(): Promise<boolean> {
  try {
    const r = await req('/health')
    return r.ok
  } catch {
    return false
  }
}

export async function getPlayerSnapshot(
  guildId: string,
): Promise<PlayerSnapshot | null> {
  const r = await req(`/api/players/${encodeURIComponent(guildId)}`)
  if (r.status === 404) {
    return null
  }
  if (!r.ok) {
    throw new Error(await r.text())
  }
  const j = (await r.json()) as { player: PlayerSnapshot }
  return j.player
}

export async function postJoin(
  guildId: string,
  body: { voiceChannelId: string; textChannelId?: string },
) {
  return req(`/api/players/${encodeURIComponent(guildId)}/join`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function postPlay(
  guildId: string,
  body: {
    query: string
    voiceChannelId: string
    textChannelId?: string
    requesterId: string
  },
) {
  const r = await req(`/api/players/${encodeURIComponent(guildId)}/play`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return r
}

export async function postPause(guildId: string, body?: { paused?: boolean }) {
  return req(`/api/players/${encodeURIComponent(guildId)}/pause`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export async function postResume(guildId: string) {
  return req(`/api/players/${encodeURIComponent(guildId)}/resume`, {
    method: 'POST',
    body: '{}',
  })
}

export async function postSkip(guildId: string) {
  return req(`/api/players/${encodeURIComponent(guildId)}/skip`, {
    method: 'POST',
    body: '{}',
  })
}

export async function postSeek(guildId: string, positionMs: number) {
  return req(`/api/players/${encodeURIComponent(guildId)}/seek`, {
    method: 'POST',
    body: JSON.stringify({ positionMs }),
  })
}

export async function postVolume(guildId: string, volume: number) {
  return req(`/api/players/${encodeURIComponent(guildId)}/volume`, {
    method: 'POST',
    body: JSON.stringify({ volume }),
  })
}

export async function postLoop(
  guildId: string,
  mode: 'off' | 'track' | 'queue',
) {
  return req(`/api/players/${encodeURIComponent(guildId)}/loop`, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  })
}

export async function postShuffle(guildId: string) {
  return req(`/api/players/${encodeURIComponent(guildId)}/shuffle`, {
    method: 'POST',
    body: '{}',
  })
}

export async function postClear(guildId: string) {
  return req(`/api/players/${encodeURIComponent(guildId)}/clear`, {
    method: 'POST',
    body: '{}',
  })
}

export async function postStop(guildId: string) {
  return req(`/api/players/${encodeURIComponent(guildId)}/stop`, {
    method: 'POST',
    body: '{}',
  })
}

export async function postQueueAdd(
  guildId: string,
  body: { encoded: string; requesterId: string; position?: number },
) {
  return req(`/api/players/${encodeURIComponent(guildId)}/queue`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteQueueIndex(guildId: string, index: number) {
  return req(`/api/players/${encodeURIComponent(guildId)}/queue/${index}`, {
    method: 'DELETE',
  })
}

export async function postQueueMove(
  guildId: string,
  body: { from: number; to: number },
) {
  return req(`/api/players/${encodeURIComponent(guildId)}/queue/move`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getSearch(query: string) {
  const u = new URL('/api/search', baseUrl())
  u.searchParams.set('query', query)
  return req(`${u.pathname}${u.search}`)
}
