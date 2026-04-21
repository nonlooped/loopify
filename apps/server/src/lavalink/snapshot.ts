import type { PlayerSnapshot, QueueItem } from '@loopify/protocol'
import type { Player, Track } from 'lavalink-client'

function requesterIdFromTrack(t: Track): string | undefined {
  const r = t.requester
  if (!r || typeof r !== 'object') {
    return undefined
  }
  const id = (r as { id?: unknown }).id
  return typeof id === 'string' ? id : undefined
}

function trackToQueueItem(t: Track | null): QueueItem | null {
  if (!t) {
    return null
  }
  return {
    encoded: t.encoded,
    requesterId: requesterIdFromTrack(t),
    info: {
      title: t.info.title,
      author: t.info.author,
      duration: t.info.duration,
      uri: t.info.uri,
      identifier: t.info.identifier,
      artworkUrl: t.info.artworkUrl ?? undefined,
    },
  }
}

export function playerToSnapshot(player: Player): PlayerSnapshot {
  const current = player.queue.current
  const queueTracks = player.queue.tracks
  const queue: QueueItem[] = []
  for (const t of queueTracks) {
    const item = trackToQueueItem(t as Track)
    if (item) {
      queue.push(item)
    }
  }

  return {
    guildId: player.guildId,
    voiceChannelId: player.voiceChannelId,
    textChannelId: player.textChannelId,
    position: player.position,
    paused: player.paused,
    playing: player.playing,
    volume: player.volume,
    repeatMode: player.repeatMode,
    current: trackToQueueItem(current as Track | null),
    queue,
    ping: player.ping,
  }
}
