import { existsSync } from "node:fs"
import { join } from "node:path"

const MPV_BINARY_NAME = process.platform === "win32" ? "mpv.exe" : "mpv"
const ENV_MPV_PATH = "LOOPIFY_MPV_PATH"

export function resolveMpvPath(configuredPath: string): string {
  const envPath = process.env[ENV_MPV_PATH]?.trim()
  if (envPath) {
    return envPath
  }

  const bundledPath = resolveBundledMpvPath()
  if (bundledPath) {
    return bundledPath
  }

  return configuredPath
}

function resolveBundledMpvPath(): string | null {
  const platformArch = `${process.platform}-${process.arch}`
  const relativeParts = ["binaries", "mpv", platformArch, MPV_BINARY_NAME]
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
