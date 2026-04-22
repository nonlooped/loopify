import type { PlayerSnapshot } from '../types/music.js'
import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { editReplyV2Error, replyMusicSuccess } from '../music/reply.js'
import { postPlay } from '../server-link/api.js'
import {
  ensureGuildVoice,
  ensureMusicServer,
  resolveGuildTextChannel,
} from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play audio from a search or a supported URL')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription('Search text or a YouTube / SoundCloud / etc. URL')
      .setRequired(true),
  )

export const meta = {
  category: 'playback',
  examples: [
    '/play query: never gonna give you up',
    '/play query: https://youtu.be/dQw4w9WgXcQ',
  ],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const voice = await ensureGuildVoice(interaction)
  if (!voice.ok) {
    return
  }

  if (!(await ensureMusicServer(interaction))) {
    return
  }

  const queryRaw = interaction.options.getString('query', true)

  await interaction.deferReply()

  const textCh = resolveGuildTextChannel(interaction)

  try {
    const r = await postPlay(voice.guildId, {
      query: queryRaw.trim(),
      voiceChannelId: voice.voiceChannel.id,
      textChannelId: textCh?.id,
      requesterId: interaction.user.id,
      requesterName: interaction.user.globalName ?? interaction.user.username,
      requesterAvatarUrl: interaction.user.displayAvatarURL({ size: 64 }),
    })
    if (!r.ok) {
      let msg = r.statusText
      try {
        const errBody = (await r.json()) as { error?: string }
        if (errBody.error) {
          msg = errBody.error
        }
      } catch {
        /* use statusText */
      }
      await editReplyV2Error(interaction, msg)
      return
    }
    const j = (await r.json()) as { player: PlayerSnapshot }
    const title = j.player.current?.info.title ?? 'Unknown track'
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.play,
      title: 'Added to Queue',
      description: title,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await editReplyV2Error(interaction, `Could not play that: ${message}`)
  }
}
