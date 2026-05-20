import { existsSync } from "node:fs"
import { join } from "node:path"

function bundledBinaryRoots(binaryDir: string): string[] {
  const platformArch = `${process.platform}-${process.arch}`
  return [
    join(process.resourcesPath, "binaries", binaryDir, platformArch),
    join(process.cwd(), "resources", "binaries", binaryDir, platformArch),
  ]
}

export function resolveBundledBinaryRoot(binaryDir: string, binaryName: string): string | null {
  for (const root of bundledBinaryRoots(binaryDir)) {
    if (existsSync(join(root, binaryName)) || existsSync(join(root, "bin", binaryName))) {
      return root
    }
  }

  return null
}

export function resolveBundledBinary(binaryDir: string, binaryName: string): string | null {
  const platformArch = `${process.platform}-${process.arch}`
  const relativeCandidates = [
    ["binaries", binaryDir, platformArch, "bin", binaryName],
    ["binaries", binaryDir, platformArch, binaryName],
  ]

  for (const relativeParts of relativeCandidates) {
    const candidates = [
      join(process.resourcesPath, ...relativeParts),
      join(process.cwd(), "resources", ...relativeParts),
    ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}
