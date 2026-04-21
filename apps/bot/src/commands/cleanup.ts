import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { deleteQueueIndex } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('cleanup')
  .setDescription(
    "Remove queued tracks from users who aren't in the voice channel",
  )

export const meta = {
  category: 'queue',
  examples: ['/cleanup'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const vcId = ctx.snapshot.voiceChannelId
  if (!vcId || !interaction.guild) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.reload,
      title: 'Cleanup',
      description: 'The bot is not connected to a voice channel.',
    })
    return
  }
  const channel = await interaction.guild.channels.fetch(vcId).catch(() => null)
  if (!channel?.isVoiceBased()) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.reload,
      title: 'Cleanup',
      description: 'Could not resolve the voice channel.',
    })
    return
  }
  const present = new Set(channel.members.map((m) => m.id))
  const removeIdx: number[] = []
  const { queue } = ctx.snapshot
  for (let i = 0; i < queue.length; i++) {
    const uid = queue[i]?.requesterId
    if (!uid) {
      continue
    }
    if (!present.has(uid)) {
      removeIdx.push(i)
    }
  }
  for (const idx of removeIdx.sort((a, b) => b - a)) {
    await deleteQueueIndex(ctx.guildId, idx)
  }
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: 'Queue Cleaned Up',
    description:
      removeIdx.length > 0
        ? `Removed ${removeIdx.length} track(s) from users not in ${channel.name}.`
        : 'No removable tracks were found.',
  })
}
