import { MessageFlags, type StringSelectMenuInteraction } from 'discord.js'
import type { Track } from 'lavalink-client'
import { AppEmojis } from '../../lib/app-emojis.js'
import { createStatusContainer } from '../../lib/components-v2.js'
import { consumeInteractionSession } from '../../lib/interaction-sessions.js'
import {
  ensureLavalink,
  getOrCreatePlayer,
  replyMusicError,
  resolveGuildTextChannel,
} from '../../services/music-player.js'
import type { BotClient } from '../../types/commands.js'

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
  tracks: Pick<Track, 'encoded' | 'info' | 'pluginInfo'>[]
}

export async function execute(
  interaction: StringSelectMenuInteraction,
  parsed: { token: string },
) {
  const client = interaction.client as BotClient
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

  if (!(await ensureLavalink(interaction, client))) {
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

  const player = await getOrCreatePlayer(
    client,
    interaction.guildId,
    voiceChannel,
    resolveGuildTextChannel(interaction),
  )

  const track = client.lavalink.utils.buildTrack(
    {
      encoded: entry.encoded,
      info: entry.info,
      pluginInfo: entry.pluginInfo,
    },
    interaction.user,
  )

  const wasActive = player.playing || player.paused
  await player.queue.add(track)
  if (!wasActive) {
    await player.play()
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
