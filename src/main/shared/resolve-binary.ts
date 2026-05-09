import { resolveBundledBinary } from "./resolve-bundled-binary"

type BinaryResolutionOptions = {
  envVar?: string
  binaryDir: string
  binaryName: string
  configuredPath: string
}

export function resolveBinaryPath(options: BinaryResolutionOptions): string {
  const { envVar, binaryDir, binaryName, configuredPath } = options

  if (envVar) {
    const envPath = process.env[envVar]?.trim()
    if (envPath) {
      return envPath
    }
  }

  const bundledPath = resolveBundledBinary(binaryDir, binaryName)
  if (bundledPath) {
    return bundledPath
  }

  return configuredPath
}
