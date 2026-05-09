import { resolveBinaryPath } from "../shared/resolve-binary"

const YTDLP_BINARY_NAME = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"

export function resolveYtdlpPath(settingsPath: string | undefined): string {
  return (
    resolveBinaryPath({
      binaryDir: "yt-dlp",
      binaryName: YTDLP_BINARY_NAME,
      configuredPath: settingsPath ?? "yt-dlp",
    }) ?? "yt-dlp"
  )
}
