import type { Interaction } from 'discord.js'
import { logError } from './logger.js'

export async function handleInteractionError(
  interaction: Interaction,
  error: unknown,
): Promise<void> {
  logError('interactions', error)
  try {
    if (interaction.isAutocomplete()) {
      await interaction.respond([])
      return
    }
    if (interaction.isRepliable()) {
      const payload = { content: 'Something went wrong.', ephemeral: true }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch(() => {})
      } else {
        await interaction.reply(payload).catch(() => {})
      }
    }
  } catch {
    // Secondary failures are intentionally ignored.
  }
}
