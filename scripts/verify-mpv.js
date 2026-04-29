import { existsSync } from "node:fs"
import { join } from "node:path"

const platformArch = `${process.platform}-${process.arch}`
const binaryName = process.platform === "win32" ? "mpv.exe" : "mpv"
const mpvPath = join(process.cwd(), "resources", "binaries", "mpv", platformArch, binaryName)

if (!existsSync(mpvPath)) {
  console.error(`Bundled mpv not found at: ${mpvPath}`)
  console.error("Run 'pnpm run prepare:binaries' to download it.")
  process.exit(1)
}

console.log(`Bundled mpv verified at: ${mpvPath}`)