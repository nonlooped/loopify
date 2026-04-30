import { resolveBundledBinary } from "../shared/resolve-bundled-binary"

const MPV_BINARY_NAME = process.platform === "win32" ? "mpv.exe" : "mpv"
const ENV_MPV_PATH = "LOOPIFY_MPV_PATH"

export function resolveMpvPath(configuredPath: string): string {
  const envPath = process.env[ENV_MPV_PATH]?.trim()
  if (envPath) {
    return envPath
  }

  const bundledPath = resolveBundledBinary("mpv", MPV_BINARY_NAME)
  if (bundledPath) {
    return bundledPath
  }

  return configuredPath
}
