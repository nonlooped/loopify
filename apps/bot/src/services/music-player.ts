import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  GuildMember,
  type GuildTextBasedChannel,
  MessageFlags,
  PermissionFlagsBits,
  type StringSelectMenuInteraction,
  type VoiceBasedChannel,
} from 'discord.js'
import type { Player, SearchQuery } from 'lavalink-client'
import { createErrorContainer } from '../lib/components-v2.js'
import type { BotClient } from '../types/commands.js'

/** Safe text channel in a guild for Lavalink `textChannelId`. */
export function resolveGuildTextChannel(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
): GuildTextBasedChannel | null {
  const ch = interaction.channel
  if (!ch?.isTextBased() || !interaction.inGuild()) {
    return null
  }
  if (!('guild' in ch) || !ch.guild) {
    return null
  }
  return ch as GuildTextBasedChannel
}

export function buildSearchQuery(raw: string): SearchQuery {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return { query: trimmed, source: 'ytsearch' }
}

/** Parse `mm:ss`, `hh:mm:ss`, or plain seconds → milliseconds. */
export function parseTimeToMs(input: string): number | null {
  const t = input.trim()
  if (!t) {
    return null
  }
  if (/^\d+$/.test(t)) {
    return parseInt(t, 10) * 1000
  }
  const parts = t.split(':').map((p) => parseInt(p, 10))
  if (parts.some((n) => Number.isNaN(n))) {
    return null
  }
  if (parts.length === 2) {
    const [m, s] = parts
    return (m * 60 + s) * 1000
  }
  if (parts.length === 3) {
    const [h, m, s] = parts
    return (h * 3600 + m * 60 + s) * 1000
  }
  return null
}

export function requesterUserId(requester: unknown): string | null {
  if (!requester || typeof requester !== 'object') {
    return null
  }
  const id = (requester as { id?: unknown }).id
  return typeof id === 'string' ? id : null
}

export function trackDedupeKey(track: {
  encoded?: string
  info: { identifier?: string; uri?: string; title?: string; author?: string }
}): string {
  return (
    track.info.identifier ??
    track.encoded ??
    track.info.uri ??
    `${track.info.title ?? ''}\0${track.info.author ?? ''}`
  )
}

type ReplyableMusicInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction

export async function replyMusicError(
  interaction: ReplyableMusicInteraction,
  message: string,
  ephemeral = true,
) {
  const flags =
    MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0)
  const payload = {
    flags,
    components: [createErrorContainer(message).toJSON()],
  }
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload)
  } else {
    await interaction.reply(payload)
  }
}

export async function ensureGuildVoice(
  interaction: ChatInputCommandInteraction,
): Promise<
  | {
      ok: true
      guildId: string
      member: GuildMember
      voiceChannel: VoiceBasedChannel
    }
  | { ok: false }
> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await replyMusicError(
      interaction,
      'This command can only be used in a server.',
      true,
    )
    return { ok: false }
  }

  const member = interaction.member
  if (!(member instanceof GuildMember)) {
    await replyMusicError(
      interaction,
      'Could not resolve your voice state.',
      true,
    )
    return { ok: false }
  }

  const voiceChannel = member.voice.channel
  if (!voiceChannel) {
    await replyMusicError(interaction, 'Join a voice channel first.', true)
    return { ok: false }
  }

  const me = voiceChannel.guild.members.me
  const canSpeak = voiceChannel
    .permissionsFor(me ?? voiceChannel.client.user)
    ?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])

  if (!canSpeak) {
    await replyMusicError(
      interaction,
      'I need permission to connect and speak in that voice channel.',
      true,
    )
    return { ok: false }
  }

  return {
    ok: true,
    guildId: interaction.guildId,
    member,
    voiceChannel,
  }
}

export async function ensureLavalink(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
  client: BotClient,
): Promise<boolean> {
  if (!client.lavalink.useable) {
    await replyMusicError(
      interaction,
      'The music service is not connected yet. Try again shortly.',
      true,
    )
    return false
  }
  return true
}

export async function getOrCreatePlayer(
  client: BotClient,
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  textChannel: GuildTextBasedChannel | null,
): Promise<Player> {
  let player = client.lavalink.getPlayer(guildId)
  if (!player) {
    player = client.lavalink.createPlayer({
      guildId,
      voiceChannelId: voiceChannel.id,
      textChannelId: textChannel?.id ?? undefined,
      selfDeaf: true,
    })
    await player.connect()
  } else if (player.voiceChannelId !== voiceChannel.id) {
    await player.changeVoiceState({ voiceChannelId: voiceChannel.id })
  }
  return player
}

export function getPlayer(client: BotClient, guildId: string): Player | null {
  return client.lavalink.getPlayer(guildId) ?? null
}

export async function requirePlayer(
  interaction: ChatInputCommandInteraction,
  client: BotClient,
): Promise<Player | null> {
  if (!interaction.guildId) {
    await replyMusicError(
      interaction,
      'This command can only be used in a server.',
      true,
    )
    return null
  }
  const player = client.lavalink.getPlayer(interaction.guildId)
  if (!player) {
    await replyMusicError(
      interaction,
      'No active music session in this server.',
      true,
    )
    return null
  }
  return player
}

/** Same voice channel as the bot (or bot not in VC yet). */
export async function getReadyPlayer(
  interaction: ChatInputCommandInteraction,
  client: BotClient,
): Promise<{ ok: true; player: Player; guildId: string } | { ok: false }> {
  const voice = await ensureGuildVoice(interaction)
  if (!voice.ok) {
    return { ok: false }
  }
  if (!(await ensureLavalink(interaction, client))) {
    return { ok: false }
  }
  const player = await requirePlayer(interaction, client)
  if (!player) {
    return { ok: false }
  }
  if (!(await requireSameVoice(interaction, player))) {
    return { ok: false }
  }
  return { ok: true, player, guildId: voice.guildId }
}

export async function requireSameVoice(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  player: Player,
): Promise<boolean> {
  const member = interaction.member
  if (!(member instanceof GuildMember)) {
    await replyMusicError(
      interaction,
      'Could not resolve your voice state.',
      true,
    )
    return false
  }
  const vc = member.voice.channel
  if (!vc) {
    await replyMusicError(
      interaction,
      'Join the same voice channel as the bot to use this command.',
      true,
    )
    return false
  }
  if (player.voiceChannelId && player.voiceChannelId !== vc.id) {
    await replyMusicError(
      interaction,
      'You must be in the same voice channel as the bot.',
      true,
    )
    return false
  }
  return true
}
