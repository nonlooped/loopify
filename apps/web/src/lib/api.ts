import type { CommandInfo, PlayerSnapshot } from '@loopify/protocol'

export async function apiFetch(path: string, init?: RequestInit) {
  return fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

export async function fetchController(): Promise<{
  player: PlayerSnapshot | null
}> {
  const r = await apiFetch('/api/controller')
  if (r.status === 401) {
    throw new Error('Unauthorized')
  }
  if (!r.ok) {
    throw new Error(await r.text())
  }
  return r.json() as Promise<{ player: PlayerSnapshot | null }>
}

export async function fetchCommands(): Promise<{ commands: CommandInfo[] }> {
  const r = await apiFetch('/api/commands')
  if (!r.ok) {
    throw new Error(await r.text())
  }
  return r.json() as Promise<{ commands: CommandInfo[] }>
}
