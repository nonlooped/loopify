import type { Player, Track } from 'lavalink-client'
import type { PlayerSnapshot, QueueItem } from '../contracts/types.js'

type RequesterShape = {
  id?: string
  name?: string
  avatarUrl?: string
}

function requesterFromTrack(t: Track): RequesterShape {
  const r = t.requester
  if (!r || typeof r !== 'object') {
    return {}
  }
  const obj = r as Record<string, unknown>
  const id = typeof obj.id === 'string' ? obj.id : undefined
  const name = typeof obj.name === 'string' ? obj.name : undefined
  const avatarUrl =
    typeof obj.avatarUrl === 'string' ? obj.avatarUrl : undefined
  return { id, name, avatarUrl }
}

function trackToQueueItem(t: Track | null): QueueItem | null {
  if (!t) {
    return null
  }
  const requester = requesterFromTrack(t)
  return {
    encoded: t.encoded,
    requesterId: requester.id,
    requesterName: requester.name,
    requesterAvatarUrl: requester.avatarUrl,
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
