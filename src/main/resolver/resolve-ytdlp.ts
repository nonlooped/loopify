import { resolveBinaryPath } from "../shared/resolve-binary"

export function resolveYtdlpPath(settingsPath: string | undefined): string {
  return (
    resolveBinaryPath({
      binaryDir: "yt-dlp/win-x64",
      binaryName: "yt-dlp.exe",
      configuredPath: settingsPath ?? "yt-dlp",
    }) ?? "yt-dlp"
  )
}
