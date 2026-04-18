import {
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import type { SearchQuery } from 'lavalink-client'
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

function buildSearchQuery(raw: string): SearchQuery {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return { query: trimmed, source: 'ytsearch' }
}

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    })
    return
  }

  const member = interaction.member
  if (!(member instanceof GuildMember)) {
    await interaction.reply({
      content: 'Could not resolve your voice state.',
      ephemeral: true,
    })
    return
  }

  const voiceChannel = member.voice.channel
  if (!voiceChannel) {
    await interaction.reply({
      content: 'Join a voice channel first.',
      ephemeral: true,
    })
    return
  }

  const me = voiceChannel.guild.members.me
  const canSpeak = voiceChannel
    .permissionsFor(me ?? voiceChannel.client.user)
    ?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])

  if (!canSpeak) {
    await interaction.reply({
      content:
        'I need permission to connect and speak in that voice channel.',
      ephemeral: true,
    })
    return
  }

  if (!client.lavalink.useable) {
    await interaction.reply({
      content: 'The music service is not connected yet. Try again shortly.',
      ephemeral: true,
    })
    return
  }

  const queryRaw = interaction.options.getString('query', true)
  const searchQuery = buildSearchQuery(queryRaw)

  await interaction.deferReply()

  let player = client.lavalink.getPlayer(interaction.guildId)
  if (!player) {
    player = client.lavalink.createPlayer({
      guildId: interaction.guildId,
      voiceChannelId: voiceChannel.id,
      textChannelId: interaction.channelId,
      selfDeaf: true,
    })
    await player.connect()
  } else if (player.voiceChannelId !== voiceChannel.id) {
    await player.changeVoiceState({ voiceChannelId: voiceChannel.id })
  }

  try {
    const result = await player.search(searchQuery, interaction.user)

    if (result.loadType === 'empty' || result.loadType === 'error') {
      const detail =
        result.exception?.message ?? 'Nothing matched that request.'
      await interaction.editReply(detail)
      return
    }

    const tracks = result.tracks
    if (!tracks.length) {
      await interaction.editReply('No playable tracks were returned.')
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
      await interaction.editReply(
        `Queued **${result.playlist.name}** (${tracks.length} tracks).`,
      )
      return
    }

    await interaction.editReply(`Queued **${title}**.`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await interaction.editReply(`Could not play that: ${message}`)
  }
}
