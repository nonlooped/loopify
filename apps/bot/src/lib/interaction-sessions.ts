/**
 * Ephemeral in-memory sessions for tokens embedded in component customIds (confirm flows, large payloads).
 *
 * Single Node process only — not shared across shards or replicas. For production multi-shard bots,
 * use Redis or another shared store instead of this module.
 */

import { randomUUID } from 'node:crypto'

type Entry = { payload: unknown; expiresAt: number }

const sessions = new Map<string, Entry>()

function purgeExpired() {
  const now = Date.now()
  for (const [key, entry] of sessions) {
    if (entry.expiresAt <= now) {
      sessions.delete(key)
    }
  }
}

/** Returns a token to embed in a customId (e.g. pair with a RegExp or `parseCustomId` handler). */
export function createInteractionSession(
  payload: unknown,
  ttlMs: number,
): string {
  purgeExpired()
  const token = randomUUID()
  sessions.set(token, { payload, expiresAt: Date.now() + ttlMs })
  return token
}

/** Read without consuming (still enforces expiry). */
export function peekInteractionSession(token: string): unknown | null {
  purgeExpired()
  const entry = sessions.get(token)
  if (!entry) {
    return null
  }
  if (entry.expiresAt <= Date.now()) {
    sessions.delete(token)
    return null
  }
  return entry.payload
}

/** Read once; removes the session. */
export function consumeInteractionSession(token: string): unknown | null {
  const entry = sessions.get(token)
  if (!entry) {
    return null
  }
  sessions.delete(token)
  if (entry.expiresAt <= Date.now()) {
    return null
  }
  return entry.payload
}
