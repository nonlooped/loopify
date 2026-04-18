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

/** Default “status card” accent (green bar). */
export const AccentStatus = 0x3eff7a

/** Rich cards (e.g. now playing). */
export const AccentRich = 0xb36bff

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
    .setAccentColor(0xed4245)
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
