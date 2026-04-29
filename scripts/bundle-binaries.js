import { spawnSync } from "node:child_process"
import { mkdirSync, existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { path7za } = require("7zip-bin")

const PLATFORM = process.platform
const ARCH = process.arch
const PLATFORM_ARCH = `${PLATFORM}-${ARCH}`

const BIN_DIR = join(process.cwd(), "resources", "binaries")
const MPV_DIR = join(BIN_DIR, "mpv", PLATFORM_ARCH)
const YTDLP_DIR = join(BIN_DIR, "yt-dlp", PLATFORM_ARCH)

async function main() {
  console.log(`Bundling binaries for ${PLATFORM_ARCH}...`)

  mkdirSync(MPV_DIR, { recursive: true })
  mkdirSync(YTDLP_DIR, { recursive: true })

  await bundleYtdlp()

  if (PLATFORM === "win32") {
    await bundleWindowsMpv()
  } else if (PLATFORM === "darwin") {
    await bundleMacosMpv()
  } else if (PLATFORM === "linux") {
    await bundleLinuxMpv()
  }
}

function checkResult(result, label) {
  if (result.status !== 0 || result.error) {
    throw new Error(`${label} failed (exit code ${result.status}): ${result.stderr?.toString().trim() || result.error?.message || "unknown error"}`)
  }
}

async function bundleYtdlp() {
  const binaryName = PLATFORM === "win32" ? "yt-dlp.exe" : "yt-dlp"
  const ytdlpPath = join(YTDLP_DIR, binaryName)

  if (existsSync(ytdlpPath)) {
    console.log("yt-dlp already exists, skipping download.")
    return
  }

  console.log(`Downloading yt-dlp for ${PLATFORM}...`)
  const url =
    PLATFORM === "win32"
      ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
      : PLATFORM === "darwin"
        ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
        : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"

  const result = spawnSync("curl", ["-L", url, "-o", ytdlpPath])
  checkResult(result, "yt-dlp download")
  if (PLATFORM !== "win32") {
    spawnSync("chmod", ["+x", ytdlpPath])
  }
}

async function bundleWindowsMpv() {
  const mpvPath = join(MPV_DIR, "mpv.exe")
  if (existsSync(mpvPath)) {
    console.log("mpv.exe already exists, skipping.")
    return
  }

  console.log("Downloading and extracting mpv for Windows...")
  const tempDir = join(process.cwd(), "temp_binaries")
  mkdirSync(tempDir, { recursive: true })

  const ghView = spawnSync("gh", [
    "release",
    "view",
    "-R",
    "shinchiro/mpv-winbuild-cmake",
    "--json",
    "assets",
    "-q",
    '.assets[] | select(.name | startswith("mpv-x86_64") and contains("git") and endswith(".7z") and (contains("v3") | not)) | .name',
  ])

  const filename = ghView.stdout.toString().split("\n")[0].trim()
  if (!filename) {
    console.error("Could not find mpv release asset for Windows.")
    return
  }

  const dlResult = spawnSync("gh", [
    "release",
    "download",
    "-R",
    "shinchiro/mpv-winbuild-cmake",
    "-p",
    filename,
    "-D",
    tempDir,
  ])
  checkResult(dlResult, "mpv download")

  const extractResult = spawnSync(path7za, ["e", join(tempDir, filename), `-o${MPV_DIR}`, "mpv.exe", "-y"])
  checkResult(extractResult, "mpv extraction")

  rmSync(tempDir, { recursive: true, force: true })
}

async function bundleMacosMpv() {
  const mpvPath = join(MPV_DIR, "mpv")
  if (existsSync(mpvPath)) return

  console.log("Downloading mpv for macOS (Universal)...")
  const url = "https://laboratory.stolendata.it/mpv/mpv-latest.tar.gz"
  const tempDir = join(process.cwd(), "temp_mpv_mac")
  mkdirSync(tempDir, { recursive: true })

  const tarPath = join(tempDir, "mpv.tar.gz")
  const dlResult = spawnSync("curl", ["-L", url, "-o", tarPath])
  checkResult(dlResult, "mpv macOS download")
  spawnSync("tar", ["-xzf", tarPath, "-C", tempDir])

  const extractedMpv = join(tempDir, "mpv.app", "Contents", "MacOS", "mpv")
  if (existsSync(extractedMpv)) {
    spawnSync("cp", [extractedMpv, mpvPath])
    spawnSync("chmod", ["+x", mpvPath])
  }

  rmSync(tempDir, { recursive: true, force: true })
}

async function bundleLinuxMpv() {
  const mpvPath = join(MPV_DIR, "mpv")
  if (existsSync(mpvPath)) return

  console.log("Linux: mpv usually requires system dependencies (libmpv/ffmpeg).")
  console.log("Consider using a static build from https://github.com/probonopd/mpv-static/releases")

  const ghView = spawnSync("gh", [
    "release",
    "view",
    "-R",
    "probonopd/mpv-static",
    "--json",
    "assets",
    "-q",
    '.assets[] | select(.name | contains("x86_64") and endswith(".tar.gz")) | .name',
  ])

  const filename = ghView.stdout.toString().split("\n")[0].trim()
  if (!filename) return

  const tempDir = join(process.cwd(), "temp_mpv_linux")
  mkdirSync(tempDir, { recursive: true })

  const dlResult = spawnSync("gh", [
    "release",
    "download",
    "-R",
    "probonopd/mpv-static",
    "-p",
    filename,
    "-D",
    tempDir,
  ])
  checkResult(dlResult, "mpv Linux download")
  spawnSync("tar", ["-xzf", join(tempDir, filename), "-C", MPV_DIR, "mpv"])
  spawnSync("chmod", ["+x", mpvPath])

  rmSync(tempDir, { recursive: true, force: true })
}

main().catch(console.error)