import { resolveBinaryPath } from "../shared/resolve-binary"

const MPV_BINARY_NAME = process.platform === "win32" ? "mpv.exe" : "mpv"

export function resolveMpvPath(settingsPath: string | undefined): string {
  return resolveBinaryPath({
    envVar: "LOOPIFY_MPV_PATH",
    binaryDir: "mpv",
    binaryName: MPV_BINARY_NAME,
    configuredPath: settingsPath ?? "mpv",
  })
}
