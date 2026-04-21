import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js'

import { AppEmojis } from '../../lib/app-emojis.js'
import { createStatusContainer } from '../../lib/components-v2.js'
import { consumeInteractionSession } from '../../lib/interaction-sessions.js'
import { postJoin, postQueueAdd } from '../../server-link/api.js'
import {
  ensureMusicServer,
  replyMusicError,
  resolveGuildTextChannel,
} from '../../services/music-player.js'

const PREFIX = 'music:search:'

export const interactionRoutePriority = 10

export function parseCustomId(id: string): { token: string } | null {
  if (!id.startsWith(PREFIX)) {
    return null
  }
  const token = id.slice(PREFIX.length)
  if (!token) {
    return null
  }
  return { token }
}

type SessionPayload = {
  guildId: string
  userId: string
  tracks: Array<{
    encoded: string
    info: { title?: string; author?: string }
    pluginInfo: Record<string, unknown>
  }>
}

export async function execute(
  interaction: StringSelectMenuInteraction,
  parsed: { token: string },
) {
  if (!interaction.inGuild() || !interaction.guildId) {
    await replyMusicError(
      interaction,
      'This can only be used in a server.',
      true,
    )
    return
  }

  const raw = consumeInteractionSession(parsed.token) as SessionPayload | null
  if (
    !raw ||
    raw.guildId !== interaction.guildId ||
    raw.userId !== interaction.user.id
  ) {
    await replyMusicError(
      interaction,
      'This search menu expired or is invalid. Run `/search` again.',
      true,
    )
    return
  }

  if (!(await ensureMusicServer(interaction))) {
    return
  }

  const idx = parseInt(interaction.values[0] ?? '', 10)
  const entry = raw.tracks[idx]
  if (!entry?.encoded) {
    await replyMusicError(interaction, 'Could not resolve that track.', true)
    return
  }

  const guild = interaction.guild
  if (!guild) {
    await replyMusicError(interaction, 'Guild not found.', true)
    return
  }

  const member = await guild.members.fetch(interaction.user.id)
  const voiceChannel = member.voice.channel
  if (!voiceChannel) {
    await replyMusicError(
      interaction,
      'Join a voice channel before selecting a track.',
      true,
    )
    return
  }

  const textCh = resolveGuildTextChannel(interaction)
  const joinR = await postJoin(interaction.guildId, {
    voiceChannelId: voiceChannel.id,
    textChannelId: textCh?.id,
  })
  if (!joinR.ok) {
    await replyMusicError(interaction, await joinR.text(), true)
    return
  }

  const addR = await postQueueAdd(interaction.guildId, {
    encoded: entry.encoded,
    requesterId: interaction.user.id,
  })
  if (!addR.ok) {
    await replyMusicError(interaction, await addR.text(), true)
    return
  }

  const container = createStatusContainer({
    emoji: AppEmojis.play,
    title: 'Added to Queue',
    description: entry.info.title ?? 'Unknown track',
  })
  await interaction.reply({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [container.toJSON()],
  })
}
