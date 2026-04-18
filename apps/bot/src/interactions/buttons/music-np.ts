import type { ButtonInteraction, MessageEditOptions } from 'discord.js'

import { AppEmojis } from '../../lib/app-emojis.js'
import {
  createStatusContainer,
  v2MessageOptions,
} from '../../lib/components-v2.js'
import { buildNowPlayingPayload } from '../../music/payloads.js'
import {
  getPlayer,
  replyMusicError,
  requireSameVoice,
} from '../../services/music-player.js'
import type { BotClient } from '../../types/commands.js'

const PREFIX = 'music:np:'

export const interactionRoutePriority = 20

export function parseCustomId(
  id: string,
): { action: string; guildId: string } | null {
  if (!id.startsWith(PREFIX)) {
    return null
  }
  const rest = id.slice(PREFIX.length)
  const colon = rest.indexOf(':')
  if (colon === -1) {
    return null
  }
  const action = rest.slice(0, colon)
  const guildId = rest.slice(colon + 1)
  if (!action || !guildId) {
    return null
  }
  return { action, guildId }
}

export async function execute(
  interaction: ButtonInteraction,
  parsed: { action: string; guildId: string },
) {
  const client = interaction.client as BotClient
  if (!interaction.inGuild() || interaction.guildId !== parsed.guildId) {
    await replyMusicError(interaction, 'This control is not valid here.', true)
    return
  }

  const player = getPlayer(client, parsed.guildId)
  if (!player) {
    await replyMusicError(interaction, 'No active music session.', true)
    return
  }

  if (!(await requireSameVoice(interaction, player))) {
    return
  }

  await interaction.deferUpdate()

  switch (parsed.action) {
    case 'pause':
      if (player.paused) {
        await player.resume()
      } else {
        await player.pause()
      }
      break
    case 'skip':
      try {
        await player.skip()
      } catch {
        await interaction.followUp({
          content: 'Nothing to skip.',
          ephemeral: true,
        })
        return
      }
      break
    case 'loop': {
      const next = player.repeatMode === 'track' ? 'off' : 'track'
      await player.setRepeatMode(next)
      break
    }
    case 'stop':
      await player.destroy()
      if (interaction.message.editable) {
        await interaction.message.edit({
          ...v2MessageOptions(
            createStatusContainer({
              emoji: AppEmojis.cancel,
              title: 'Playback Stopped',
              description: 'Playback ended and the bot left the voice channel.',
            }),
          ),
          content: null,
        } as MessageEditOptions)
      }
      return
    default:
      await interaction.followUp({
        content: 'Unknown control.',
        ephemeral: true,
      })
      return
  }

  if (!interaction.guild || !interaction.message.editable) {
    return
  }
  const remaining = getPlayer(client, parsed.guildId)
  if (!remaining) {
    return
  }
  const nextPayload = await buildNowPlayingPayload(remaining, interaction.guild)
  await interaction.message.edit({
    ...nextPayload,
    content: null,
  } as MessageEditOptions)
}
