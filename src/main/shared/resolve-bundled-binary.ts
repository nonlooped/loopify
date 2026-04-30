import { existsSync } from "node:fs"
import { join } from "node:path"

export function resolveBundledBinary(binaryDir: string, binaryName: string): string | null {
  const platformArch = `${process.platform}-${process.arch}`
  const relativeParts = ["binaries", binaryDir, platformArch, binaryName]
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
