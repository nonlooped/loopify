export type LoopMode = 'off' | 'track' | 'queue'

export type TrackInfo = {
  title?: string
  author?: string
  duration?: number
  uri?: string
  identifier?: string
  artworkUrl?: string
}

export type QueueItem = {
  encoded?: string
  requesterId?: string | null
  requesterName?: string
  requesterAvatarUrl?: string
  info: TrackInfo
}

export type PlayerSnapshot = {
  guildId: string
  voiceChannelId: string | null
  textChannelId: string | null
  position: number
  paused: boolean
  playing: boolean
  volume: number
  repeatMode: LoopMode
  current: QueueItem | null
  queue: QueueItem[]
  ping?: {
    ws: number
    lavalink: number
  }
}

export type CommandOption = {
  name: string
  description: string
  type: number
  required?: boolean
  minValue?: number
  maxValue?: number
  choices?: Array<{ name: string; value: string | number }>
}

export type CommandCategory = 'playback' | 'queue' | 'voice' | 'info' | 'other'

export type CommandInfo = {
  name: string
  description: string
  category: CommandCategory
  examples: string[]
  options: CommandOption[]
}

export type ServerEvent =
  | {
      type: 'playerUpdate'
      guildId: string
      snapshot?: Partial<PlayerSnapshot>
    }
  | {
      type: 'trackStart'
      guildId: string
      snapshot: PlayerSnapshot
    }
  | {
      type: 'trackEnd'
      guildId: string
      reason?: string
    }
  | {
      type: 'queueChange'
      guildId: string
      length: number
    }
  | {
      type: 'voiceStateUpdate'
      guildId: string
      userId: string
      voiceChannelId: string | null
    }
  | {
      type: 'playerDestroyed'
      guildId: string
      reason?: string
    }

export type SseEnvelope = {
  type: 'serverEvent'
  event: ServerEvent
}
