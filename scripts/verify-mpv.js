import { existsSync } from "node:fs"
import { join } from "node:path"

const platformArch = `${process.platform}-${process.arch}`
const binaryName = process.platform === "win32" ? "mpv.exe" : "mpv"
const candidates = [
  join(process.cwd(), "resources", "binaries", "mpv", platformArch, "bin", binaryName),
  join(process.cwd(), "resources", "binaries", "mpv", platformArch, binaryName),
]

const mpvPath = candidates.find((candidate) => existsSync(candidate))

if (!mpvPath) {
  console.error(`Bundled mpv not found. Checked:\n${candidates.map((candidate) => `- ${candidate}`).join("\n")}`)
  console.error("Run 'pnpm run prepare:binaries' to download it.")
  process.exit(1)
}

console.log(`Bundled mpv verified at: ${mpvPath}`)
