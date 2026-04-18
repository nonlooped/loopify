import {
  type ChatInputCommandInteraction,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  MessageFlags,
} from 'discord.js'

import { type AppEmojiMarkup, AppEmojis } from '../lib/app-emojis.js'
import {
  createErrorContainer,
  createStatusContainer,
  v2MessageOptions,
} from '../lib/components-v2.js'

export async function replyMusicSuccess(
  interaction: ChatInputCommandInteraction,
  options: { title: string; description: string; emoji?: AppEmojiMarkup },
) {
  const emoji = options.emoji ?? AppEmojis.play
  const payload = v2MessageOptions(
    createStatusContainer({
      emoji,
      title: options.title,
      description: options.description,
    }),
  ) as InteractionReplyOptions
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload as InteractionEditReplyOptions)
  } else {
    await interaction.reply(payload)
  }
}

export async function editReplyV2Error(
  interaction: ChatInputCommandInteraction,
  message: string,
) {
  await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [createErrorContainer(message).toJSON()],
  } as InteractionEditReplyOptions)
}
