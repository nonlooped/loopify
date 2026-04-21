/** Per-guild userId -> voiceChannelId (null = not in VC) */
export class VoiceMirror {
  private guilds = new Map<string, Map<string, string | null>>()

  set(guildId: string, userId: string, voiceChannelId: string | null) {
    let m = this.guilds.get(guildId)
    if (!m) {
      m = new Map()
      this.guilds.set(guildId, m)
    }
    m.set(userId, voiceChannelId)
  }

  getUserVoice(guildId: string, userId: string): string | null | undefined {
    return this.guilds.get(guildId)?.get(userId)
  }

  removeUser(guildId: string, userId: string) {
    this.guilds.get(guildId)?.delete(userId)
  }
}
