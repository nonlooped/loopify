import {
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  type InteractionReplyOptions,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js'

import { type AppEmojiMarkup, parseEmojiMarkup } from './app-emojis.js'

/**
 * Loopify accent — electric lilac, oklch(70% 0.25 305) approximated for
 * Discord's sRGB sidebar. One brand color across every surface so the bot's
 * messages read as a single object rather than a rainbow of severity colors.
 */
export const AccentBrand = 0xc77bff

/** Default status card accent. Aliased to the brand so confirmations,
 *  acknowledgements, and rich now-playing cards all match. */
export const AccentStatus = AccentBrand

/** Rich cards (e.g. now playing). Same brand color, named for legibility. */
export const AccentRich = AccentBrand

/** Error accent — Discord red is preserved for semantic clarity. Errors are
 *  the only place we deliberately depart from the brand color. */
export const AccentError = 0xed4245

export type ProgressSegmentTheme = {
  empty: { left: string; middle: string; right: string }
  half: { left: string; middle: string; right: string }
  full: { left: string; middle: string; right: string }
}

/**
 * Discrete progress strip: `progress01` in [0,1], `segmentCount` emoji slots.
 * Picks empty / half / full and left / middle / right variants per slot.
 */
export function buildSegmentedProgressBar(
  progress01: number,
  segmentCount: number,
  theme: ProgressSegmentTheme,
): string {
  if (segmentCount < 1) {
    return ''
  }
  const p = Math.min(1, Math.max(0, progress01))
  const parts: string[] = []

  for (let i = 0; i < segmentCount; i++) {
    const slotStart = i / segmentCount
    const slotEnd = (i + 1) / segmentCount
    const pos: 'left' | 'middle' | 'right' =
      i === 0 ? 'left' : i === segmentCount - 1 ? 'right' : 'middle'

    let level: 'empty' | 'half' | 'full'
    if (p <= slotStart) {
      level = 'empty'
    } else if (p >= slotEnd) {
      level = 'full'
    } else {
      level = 'half'
    }

    parts.push(theme[level][pos])
  }

  return parts.join('')
}

export function createStatusContainer(options: {
  accentColor?: number
  emoji: AppEmojiMarkup
  title: string
  description: string
}): ContainerBuilder {
  const { accentColor = AccentStatus, emoji, title, description } = options
  return new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emoji} ${title}\n-# ${description}`,
      ),
    )
}

export function createErrorContainer(description: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(AccentError)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### Something went wrong\n-# ${description}`,
      ),
    )
}

export function v2MessageOptions(
  container: ContainerBuilder,
): InteractionReplyOptions {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container.toJSON()],
  } as InteractionReplyOptions
}

export function separatorLarge() {
  return new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Large)
    .setDivider(true)
}

export function emojiButton(options: {
  customId: string
  /** `<:name:id>` from `AppEmojis`. */
  emojiMarkup: string
  style?: ButtonStyle
  disabled?: boolean
}) {
  const {
    customId,
    emojiMarkup,
    style = ButtonStyle.Secondary,
    disabled,
  } = options
  const { name, id } = parseEmojiMarkup(emojiMarkup)
  return new ButtonBuilder()
    .setCustomId(customId)
    .setStyle(style)
    .setEmoji({ id, name })
    .setDisabled(disabled ?? false)
}
