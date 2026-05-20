import { existsSync } from "node:fs"
import { join } from "node:path"
import { resolveBinaryPath } from "../shared/resolve-binary"
import { resolveBundledBinaryRoot } from "../shared/resolve-bundled-binary"

const MPV_BINARY_NAME = process.platform === "win32" ? "mpv.exe" : "mpv"

export type MpvLaunchConfig = {
  executable: string
  env: NodeJS.ProcessEnv
}

export function resolveMpvPath(settingsPath: string | undefined): string {
  return resolveBinaryPath({
    envVar: "LOOPIFY_MPV_PATH",
    binaryDir: "mpv",
    binaryName: MPV_BINARY_NAME,
    configuredPath: settingsPath ?? "mpv",
  })
}

export function resolveMpvLaunch(settingsPath: string | undefined): MpvLaunchConfig {
  const executable = resolveMpvPath(settingsPath)
  const bundledRoot = resolveBundledBinaryRoot("mpv", MPV_BINARY_NAME)

  if (bundledRoot && process.platform === "linux") {
    const appImageMpv = join(bundledRoot, "bin", MPV_BINARY_NAME)
    if (existsSync(appImageMpv) && executable === appImageMpv) {
      const binDir = join(bundledRoot, "bin")
      return {
        executable: appImageMpv,
        env: {
          ...process.env,
          APPDIR: bundledRoot,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
        },
      }
    }
  }

  return { executable, env: process.env }
}
