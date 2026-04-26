import { existsSync } from "node:fs"
import { join } from "node:path"

const requiredPath = join("resources", "binaries", "mpv", "win32-x64", "mpv.exe")

if (!existsSync(requiredPath)) {
  console.error(`Missing bundled mpv binary at "${requiredPath}".`)
  console.error("Add mpv.exe to resources/binaries/mpv/win32-x64 before packaging.")
  process.exit(1)
}

console.log(`Found bundled mpv binary at "${requiredPath}".`)
