import type { ButtonInteraction } from 'discord.js'

const PARSE_PREFIX = 'demo:parse:'

export type DemoParsePayload = { slug: string }

/**
 * Parser routing: return non-null from `parseCustomId` to handle this interaction.
 * The parsed value is passed as the second argument to `execute`.
 */
export const interactionRoutePriority = 0

export function parseCustomId(id: string): DemoParsePayload | null {
  if (!id.startsWith(PARSE_PREFIX)) {
    return null
  }
  const slug = id.slice(PARSE_PREFIX.length)
  if (!slug) {
    return null
  }
  return { slug }
}

export async function execute(
  interaction: ButtonInteraction,
  parsed: DemoParsePayload,
) {
  await interaction.reply({
    content: `Parse example — slug: ${parsed.slug}`,
    ephemeral: true,
  })
}
