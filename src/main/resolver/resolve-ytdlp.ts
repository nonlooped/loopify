import { resolveBundledBinary } from "../shared/resolve-bundled-binary"

const YTDLP_BINARY_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"

export function resolveYtdlpPath(configuredPath: string): string {
  const bundledPath = resolveBundledBinary("yt-dlp", YTDLP_BINARY_NAME)
  if (bundledPath) {
    return bundledPath
  }

  return configuredPath
}
