import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postSeek } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('rewind')
  .setDescription('Rewind the current track')
  .addIntegerOption((o) =>
    o
      .setName('seconds')
      .setDescription('How many seconds to rewind')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(3600),
  )

export const meta = {
  category: 'playback',
  examples: ['/rewind seconds: 15'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const sec = interaction.options.getInteger('seconds', true)
  const current = ctx.snapshot.current
  if (!current) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.previous,
      title: 'Nothing Playing',
      description: 'There is no active track to seek.',
    })
    return
  }
  await interaction.deferReply()
  await postSeek(ctx.guildId, Math.max(0, ctx.snapshot.position - sec * 1000))
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.previous,
    title: 'Rewound',
    description: `Moved back ${sec} second(s).`,
  })
}
