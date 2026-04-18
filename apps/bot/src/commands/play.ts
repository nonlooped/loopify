import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { editReplyV2Error, replyMusicSuccess } from '../music/reply.js'
import {
  buildSearchQuery,
  ensureGuildVoice,
  ensureLavalink,
  getOrCreatePlayer,
  resolveGuildTextChannel,
} from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play audio from a search or a supported URL')
  .addStringOption((option) =>
    option
      .setName('query')
      .setDescription('Search text or a YouTube / SoundCloud / etc. URL')
      .setRequired(true),
  )

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient

  const voice = await ensureGuildVoice(interaction)
  if (!voice.ok) {
    return
  }

  if (!(await ensureLavalink(interaction, client))) {
    return
  }

  const queryRaw = interaction.options.getString('query', true)
  const searchQuery = buildSearchQuery(queryRaw)

  await interaction.deferReply()

  const player = await getOrCreatePlayer(
    client,
    voice.guildId,
    voice.voiceChannel,
    resolveGuildTextChannel(interaction),
  )

  try {
    const result = await player.search(searchQuery, interaction.user)

    if (result.loadType === 'empty' || result.loadType === 'error') {
      const detail =
        result.exception?.message ?? 'Nothing matched that request.'
      await editReplyV2Error(interaction, detail)
      return
    }

    const tracks = result.tracks
    if (!tracks.length) {
      await editReplyV2Error(interaction, 'No playable tracks were returned.')
      return
    }

    const wasActive = player.playing || player.paused
    if (result.loadType === 'playlist') {
      await player.queue.add(tracks)
    } else {
      await player.queue.add(tracks[0])
    }

    if (!wasActive) {
      await player.play()
    }

    const first = tracks[0]
    const title = first.info.title ?? 'Unknown track'

    if (result.loadType === 'playlist' && result.playlist?.name) {
      await replyMusicSuccess(interaction, {
        emoji: AppEmojis.play,
        title: 'Playlist Queued',
        description: `${result.playlist.name} (${tracks.length} tracks).`,
      })
      return
    }

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
