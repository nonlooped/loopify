const { spawnSync } = require("node:child_process")

const drizzleArgs = process.argv.slice(2)

if (drizzleArgs.length === 0) {
  console.error("Usage: node scripts/run-drizzle-kit.cjs <drizzle-kit args...>")
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  })

  if (result.error) {
    console.error(result.error.message)
    return 1
  }

  return result.status ?? 1
}

let exitCode = run("pnpm", ["rebuild", "better-sqlite3"])

if (exitCode === 0) {
  exitCode = run("pnpm", ["exec", "drizzle-kit", ...drizzleArgs])
}

const electronRebuildExitCode = run("pnpm", [
  "exec",
  "electron-rebuild",
  "-f",
  "-w",
  "better-sqlite3",
])

process.exit(exitCode === 0 ? electronRebuildExitCode : exitCode)
