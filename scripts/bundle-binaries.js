import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
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

  console.log("Binary bundling complete.")
}

function checkResult(result, label) {
  if (result.status !== 0 || result.error) {
    throw new Error(
      `${label} failed (exit code ${result.status}): ${result.stderr?.toString().trim() || result.error?.message || "unknown error"}`
    )
  }
}

function curlDownload(url, outputPath) {
  const result = spawnSync("curl", ["-fsSL", url, "-o", outputPath], { encoding: "utf8" })
  checkResult(result, `download ${url}`)
}

function fetchGitHubLatestRelease(owner, repo) {
  const result = spawnSync(
    "curl",
    ["-fsSL", `https://api.github.com/repos/${owner}/${repo}/releases/latest`],
    { encoding: "utf8" }
  )
  checkResult(result, `GitHub release lookup for ${owner}/${repo}`)
  return JSON.parse(result.stdout)
}

function pickAsset(release, predicate) {
  const asset = release.assets?.find(predicate)
  if (!asset) {
    const names = release.assets?.map((entry) => entry.name).join(", ") ?? "none"
    throw new Error(`Could not find a matching release asset (${names}).`)
  }
  return asset
}

async function bundleYtdlp() {
  const binaryName = PLATFORM === "win32" ? "yt-dlp.exe" : "yt-dlp"
  const ytdlpPath = join(YTDLP_DIR, binaryName)

  if (existsSync(ytdlpPath)) {
    console.log("yt-dlp already exists, skipping download.")
    return
  }

  console.log(`Downloading yt-dlp for ${PLATFORM}...`)
  const release = fetchGitHubLatestRelease("yt-dlp", "yt-dlp")
  const assetName =
    PLATFORM === "win32"
      ? "yt-dlp.exe"
      : PLATFORM === "darwin"
        ? ARCH === "arm64"
          ? "yt-dlp_macos"
          : "yt-dlp_macos"
        : ARCH === "arm64"
          ? "yt-dlp_linux_aarch64"
          : "yt-dlp_linux"

  const asset = pickAsset(release, (entry) => entry.name === assetName)
  curlDownload(asset.browser_download_url, ytdlpPath)

  if (PLATFORM !== "win32") {
    chmodSync(ytdlpPath, 0o755)
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

  const release = fetchGitHubLatestRelease("shinchiro", "mpv-winbuild-cmake")
  const asset = pickAsset(
    release,
    (entry) =>
      entry.name.startsWith("mpv-x86_64") &&
      entry.name.includes("git") &&
      entry.name.endsWith(".7z") &&
      !entry.name.includes("v3")
  )

  const archivePath = join(tempDir, asset.name)
  curlDownload(asset.browser_download_url, archivePath)

  const extractResult = spawnSync(path7za, ["e", archivePath, `-o${MPV_DIR}`, "mpv.exe", "-y"])
  checkResult(extractResult, "mpv extraction")

  rmSync(tempDir, { recursive: true, force: true })
}

async function bundleMacosMpv() {
  const mpvPath = join(MPV_DIR, "mpv")
  if (existsSync(mpvPath)) {
    console.log("mpv already exists, skipping.")
    return
  }

  console.log("Downloading mpv for macOS...")
  const release = fetchGitHubLatestRelease("mpv-player", "mpv")

  const assetPredicate = (entry) =>
    entry.name.startsWith("mpv-") &&
    entry.name.includes("macos") &&
    entry.name.includes(ARCH === "arm64" ? "arm" : "intel") &&
    entry.name.endsWith(".zip")

  const asset = pickAsset(release, assetPredicate)

  const tempDir = join(process.cwd(), "temp_mpv_mac")
  mkdirSync(tempDir, { recursive: true })

  const zipPath = join(tempDir, "mpv.zip")
  curlDownload(asset.browser_download_url, zipPath)

  const unzipResult = spawnSync("unzip", ["-o", zipPath, "-d", tempDir])
  checkResult(unzipResult, "unzip mpv archive")

  spawnSync("tar", ["-xzf", join(tempDir, "mpv.tar.gz"), "-C", tempDir])

  const extractedMpv = join(tempDir, "mpv.app", "Contents", "MacOS", "mpv")
  if (!existsSync(extractedMpv)) {
    rmSync(tempDir, { recursive: true, force: true })
    throw new Error("Could not find mpv binary in the macOS archive.")
  }

  cpSync(extractedMpv, mpvPath)
  chmodSync(mpvPath, 0o755)
  rmSync(tempDir, { recursive: true, force: true })
}

async function bundleLinuxMpv() {
  const bundledMpv = join(MPV_DIR, "bin", "mpv")
  if (existsSync(bundledMpv)) {
    console.log("Linux mpv bundle already exists, skipping.")
    return
  }

  console.log("Downloading mpv AppImage bundle for Linux...")
  const tempDir = join(process.cwd(), "temp_mpv_linux")
  rmSync(tempDir, { recursive: true, force: true })
  mkdirSync(tempDir, { recursive: true })

  const release = fetchGitHubLatestRelease("pkgforge-dev", "mpv-AppImage")
  const asset = pickAsset(
    release,
    (entry) =>
      entry.name.includes("anylinux") &&
      entry.name.includes(ARCH === "arm64" ? "aarch64" : "x86_64") &&
      entry.name.endsWith(".AppImage")
  )

  const appImagePath = join(tempDir, asset.name)
  curlDownload(asset.browser_download_url, appImagePath)
  chmodSync(appImagePath, 0o755)

  const extractResult = spawnSync(appImagePath, ["--appimage-extract"], { cwd: tempDir })
  checkResult(extractResult, "mpv AppImage extraction")

  const extractedDir = join(tempDir, "AppDir")
  if (!existsSync(join(extractedDir, "bin", "mpv"))) {
    rmSync(tempDir, { recursive: true, force: true })
    throw new Error("Could not find mpv binary in the extracted AppImage.")
  }

  rmSync(MPV_DIR, { recursive: true, force: true })
  mkdirSync(MPV_DIR, { recursive: true })

  const copyResult = spawnSync("cp", ["-aL", `${extractedDir}/.`, `${MPV_DIR}/`])
  checkResult(copyResult, "mpv bundle copy")

  chmodSync(bundledMpv, 0o755)

  rmSync(tempDir, { recursive: true, force: true })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
