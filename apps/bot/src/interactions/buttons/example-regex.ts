import type { ButtonInteraction } from 'discord.js'

/**
 * RegExp routing: the entire customId must match `customIdRegExp` (see router).
 * Prefer `^ … $` so only the full string matches. `execute` receives `RegExp.prototype.exec` result.
 */
export const interactionRoutePriority = 0

export const customIdRegExp = /^demo:regex:(\d+)$/u

export async function execute(
  interaction: ButtonInteraction,
  match: RegExpExecArray,
) {
  await interaction.reply({
    content: `Regex example — group 1: ${match[1]}`,
    ephemeral: true,
  })
}
