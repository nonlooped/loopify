import { resolveBinaryPath } from "../shared/resolve-binary"

export function resolveMpvPath(settingsPath: string | undefined): string {
  return resolveBinaryPath({
    envVar: "LOOPIFY_MPV_PATH",
    binaryDir: "mpv/win-x64",
    binaryName: "mpv.exe",
    configuredPath: settingsPath ?? "mpv",
  })
}
