import type { PlayerSnapshot } from '../types/music.js'
import {
  ActionRowBuilder,
  ButtonStyle,
  bold,
  ContainerBuilder,
  type Guild,
  type InteractionReplyOptions,
  type MessageActionRowComponentBuilder,
  TextDisplayBuilder,
} from 'discord.js'

import { type AppEmojiMarkup, AppEmojis } from '../lib/app-emojis.js'
import {
  AccentRich,
  buildSegmentedProgressBar,
  createStatusContainer,
  emojiButton,
  type ProgressSegmentTheme,
  separatorLarge,
  v2MessageOptions,
} from '../lib/components-v2.js'

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0:00'
  }
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

const progressTheme: ProgressSegmentTheme = {
  empty: {
    left: AppEmojis.emptyleft,
    middle: AppEmojis.emptymiddle,
    right: AppEmojis.emptyright,
  },
  half: {
    left: AppEmojis.halffilledleft,
    middle: AppEmojis.halffilledmiddle,
    right: AppEmojis.halffilledright,
  },
  full: {
    left: AppEmojis.filledleft,
    middle: AppEmojis.filledmiddle,
    right: AppEmojis.filledright,
  },
}

function npButtonCustomId(
  action: 'pause' | 'skip' | 'loop' | 'stop',
  guildId: string,
) {
  return `music:np:${action}:${guildId}`
}

export async function buildNowPlayingPayload(
  snapshot: PlayerSnapshot,
  guild: Guild,
): Promise<InteractionReplyOptions> {
  const current = snapshot.current
  if (!current) {
    return v2MessageOptions(
      createStatusContainer({
        accentColor: AccentRich,
        emoji: AppEmojis.play,
        title: 'Nothing Playing',
        description: 'There is no track loaded right now.',
      }),
    ) as InteractionReplyOptions
  }

  const title = current.info.title ?? 'Unknown track'
  const author = current.info.author ?? 'Unknown artist'
  const duration = current.info.duration ?? 0
  const position = snapshot.position
  const progress01 = duration > 0 ? Math.min(1, position / duration) : 0
  const bar = buildSegmentedProgressBar(progress01, 12, progressTheme)

  const rid = current.requesterId
  const requesterLine = rid ? `<@${rid}>` : 'Unknown'

  let channelLine = 'Unknown'
  if (snapshot.voiceChannelId) {
    const ch = await guild.channels
      .fetch(snapshot.voiceChannelId)
      .catch(() => null)
    if (ch?.isVoiceBased()) {
      channelLine = ch.name
    }
  }

  const timeLine = `${formatMs(position)} / ${formatMs(duration)}`

  const body =
    `### ${AppEmojis.play} Now Playing\n` +
    `${bold(title)}\n` +
    `-# ${author}\n\n` +
    `${AppEmojis.plus} ${requesterLine}\n` +
    `${AppEmojis.location} ${channelLine}\n\n` +
    `\`${timeLine}\`\n` +
    bar

  const loopActive = snapshot.repeatMode === 'track'
  const pauseBtn = snapshot.paused
    ? emojiButton({
        customId: npButtonCustomId('pause', guild.id),
        emojiMarkup: AppEmojis.play,
        style: ButtonStyle.Primary,
      })
    : emojiButton({
        customId: npButtonCustomId('pause', guild.id),
        emojiMarkup: AppEmojis.pause,
        style: ButtonStyle.Secondary,
      })

  const loopBtn = emojiButton({
    customId: npButtonCustomId('loop', guild.id),
    emojiMarkup: AppEmojis.reload,
    style: loopActive ? ButtonStyle.Primary : ButtonStyle.Secondary,
  })

  const row =
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      pauseBtn,
      emojiButton({
        customId: npButtonCustomId('skip', guild.id),
        emojiMarkup: AppEmojis.next,
      }),
      loopBtn,
      emojiButton({
        customId: npButtonCustomId('stop', guild.id),
        emojiMarkup: AppEmojis.cancel,
      }),
    )

  const container = new ContainerBuilder()
    .setAccentColor(AccentRich)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addSeparatorComponents(separatorLarge())
    .addActionRowComponents(row)

  return v2MessageOptions(container) as InteractionReplyOptions
}

export function buildSimpleStatusPayload(options: {
  emoji: AppEmojiMarkup
  title: string
  description: string
}) {
  return v2MessageOptions(
    createStatusContainer({
      emoji: options.emoji,
      title: options.title,
      description: options.description,
    }),
  )
}
