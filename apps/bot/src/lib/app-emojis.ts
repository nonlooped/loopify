/** All custom emoji markup for bot UI. Do not use Unicode or default Discord emojis elsewhere. */
export const AppEmojis = {
  search: '<:search:1487856385109655674>',
  cancel: '<:cancel:1487856386808348784>',
  settings: '<:settings:1487865768568819882>',
  reload: '<:reload:1487856363404005416>',
  play: '<:play:1487856365002166483>',
  pause: '<:pause:1487871342173749419>',
  previous: '<:previous:1487856366923153500>',
  next: '<:next:1487856374741209241>',
  favorite: '<:favorite:1487856377220169988>',
  location: '<:location:1487856379107606700>',
  crown1: '<:crown1:1487856381049569392>',
  plus: '<:plus:1487856383465492620>',

  emptyleft: '<:emptyleft:1487865889742131360>',
  emptymiddle: '<:emptymiddle:1487865941835387030>',
  emptyright: '<:emptyright:1487865980305674411>',
  filledleft: '<:filledleft:1487865998966132817>',
  filledmiddle: '<:filledmiddle:1487866013826420807>',
  filledright: '<:filledright:1487866029819301902>',
  halffilledleft: '<:halffilledleft:1487866044230926547>',
  halffilledmiddle: '<:halffilledmiddle:1487866059167105305>',
  halffilledright: '<:halffilledright:1487866073993842729>',
} as const

export type AppEmojiKey = keyof typeof AppEmojis

/** Values from {@link AppEmojis} — use only these in messages and buttons. */
export type AppEmojiMarkup = (typeof AppEmojis)[AppEmojiKey]

const EMOJI_MARKUP = /^<:(\w+):(\d+)>$/

/** Parse `<:name:id>` from registry strings for Button `setEmoji` / API payloads. */
export function parseEmojiMarkup(markup: string): { name: string; id: string } {
  const m = EMOJI_MARKUP.exec(markup.trim())
  if (!m) {
    throw new RangeError('Invalid custom emoji markup')
  }
  return { name: m[1], id: m[2] }
}
