import { existsSync } from "node:fs"
import { join } from "node:path"

const YTDLP_BINARY_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"

export function resolveYtdlpPath(configuredPath: string): string {
  const bundledPath = resolveBundledYtdlpPath()
  if (bundledPath) {
    return bundledPath
  }

  return configuredPath
}

function resolveBundledYtdlpPath(): string | null {
  const platformArch = `${process.platform}-${process.arch}`
  const relativeParts = ["binaries", "yt-dlp", platformArch, YTDLP_BINARY_NAME]
  const candidates = [
    join(process.resourcesPath, ...relativeParts),
    join(process.cwd(), "resources", ...relativeParts),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}
