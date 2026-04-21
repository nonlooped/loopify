import type { ButtonInteraction, MessageEditOptions } from 'discord.js'

import { AppEmojis } from '../../lib/app-emojis.js'
import {
  createStatusContainer,
  v2MessageOptions,
} from '../../lib/components-v2.js'
import { buildNowPlayingPayload } from '../../music/payloads.js'
import {
  getPlayerSnapshot,
  postLoop,
  postPause,
  postResume,
  postSkip,
  postStop,
} from '../../server-link/api.js'
import {
  replyMusicError,
  requireSameVoiceForButton,
} from '../../services/music-player.js'

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
  if (!interaction.inGuild() || interaction.guildId !== parsed.guildId) {
    await replyMusicError(interaction, 'This control is not valid here.', true)
    return
  }

  const snapshot = await getPlayerSnapshot(parsed.guildId)
  if (!snapshot) {
    await replyMusicError(interaction, 'No active music session.', true)
    return
  }

  if (!(await requireSameVoiceForButton(interaction, snapshot))) {
    return
  }

  await interaction.deferUpdate()

  switch (parsed.action) {
    case 'pause': {
      if (snapshot.paused) {
        await postResume(parsed.guildId)
      } else {
        await postPause(parsed.guildId, { paused: true })
      }
      break
    }
    case 'skip': {
      const r = await postSkip(parsed.guildId)
      if (!r.ok) {
        await interaction.followUp({
          content: 'Nothing to skip.',
          ephemeral: true,
        })
        return
      }
      break
    }
    case 'loop': {
      const next = snapshot.repeatMode === 'track' ? 'off' : 'track'
      await postLoop(parsed.guildId, next)
      break
    }
    case 'stop':
      await postStop(parsed.guildId)
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
  const remaining = await getPlayerSnapshot(parsed.guildId)
  if (!remaining) {
    return
  }
  const nextPayload = await buildNowPlayingPayload(remaining, interaction.guild)
  await interaction.message.edit({
    ...nextPayload,
    content: null,
  } as MessageEditOptions)
}
