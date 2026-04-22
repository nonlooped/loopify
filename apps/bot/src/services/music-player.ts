import type { PlayerSnapshot } from '../types/music.js'
import {
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  PermissionFlagsBits,
  type StringSelectMenuInteraction,
  type VoiceBasedChannel,
} from 'discord.js'

import { createErrorContainer } from '../lib/components-v2.js'
import { getPlayerSnapshot, pingMusicServer } from '../server-link/api.js'

export function resolveGuildTextChannel(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
) {
  const ch = interaction.channel
  if (!ch?.isTextBased() || !interaction.inGuild()) {
    return null
  }
  if (!('guild' in ch) || !ch.guild) {
    return null
  }
  return ch
}

export function buildSearchQuery(raw: string): string {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return trimmed
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

export async function ensureMusicServer(
  interaction: ChatInputCommandInteraction | StringSelectMenuInteraction,
): Promise<boolean> {
  if (!(await pingMusicServer())) {
    await replyMusicError(
      interaction,
      'The music service is not reachable. Try again shortly.',
      true,
    )
    return false
  }
  return true
}

export async function requirePlayerSnapshot(
  interaction: ChatInputCommandInteraction,
): Promise<PlayerSnapshot | null> {
  if (!interaction.guildId) {
    await replyMusicError(
      interaction,
      'This command can only be used in a server.',
      true,
    )
    return null
  }
  const snap = await getPlayerSnapshot(interaction.guildId)
  if (!snap) {
    await replyMusicError(
      interaction,
      'No active music session in this server.',
      true,
    )
    return null
  }
  return snap
}

export async function getReadySnapshot(
  interaction: ChatInputCommandInteraction,
): Promise<
  { ok: true; snapshot: PlayerSnapshot; guildId: string } | { ok: false }
> {
  const voice = await ensureGuildVoice(interaction)
  if (!voice.ok) {
    return { ok: false }
  }
  if (!(await ensureMusicServer(interaction))) {
    return { ok: false }
  }
  const snapshot = await requirePlayerSnapshot(interaction)
  if (!snapshot) {
    return { ok: false }
  }
  if (!(await requireSameVoiceSnapshot(interaction, snapshot))) {
    return { ok: false }
  }
  return { ok: true, snapshot, guildId: voice.guildId }
}

export async function requireSameVoiceSnapshot(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  snapshot: PlayerSnapshot,
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
  if (snapshot.voiceChannelId && snapshot.voiceChannelId !== vc.id) {
    await replyMusicError(
      interaction,
      'You must be in the same voice channel as the bot.',
      true,
    )
    return false
  }
  return true
}

export async function requireSameVoiceForButton(
  interaction: ButtonInteraction,
  snapshot: PlayerSnapshot,
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
      'Join the same voice channel as the bot to use this control.',
      true,
    )
    return false
  }
  if (snapshot.voiceChannelId && snapshot.voiceChannelId !== vc.id) {
    await replyMusicError(
      interaction,
      'You must be in the same voice channel as the bot.',
      true,
    )
    return false
  }
  return true
}
