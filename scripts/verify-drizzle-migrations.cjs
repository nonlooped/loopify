/**
 * Ensures bundled SQLite migrations exist and every migration folder has migration.sql.
 * Does not connect to SQLite (safe for CI without native rebuild).
 */
const fs = require("node:fs")
const path = require("node:path")

const migrationsRoot = path.join(__dirname, "..", "src", "main", "db", "migrations")

if (!fs.existsSync(migrationsRoot)) {
  console.error(`Missing migrations directory: ${migrationsRoot}`)
  process.exit(1)
}

const entries = fs.readdirSync(migrationsRoot, { withFileTypes: true }).filter((d) => d.isDirectory())

if (entries.length === 0) {
  console.error("src/main/db/migrations must contain at least one migration folder.")
  process.exit(1)
}

let failed = false
for (const dirent of entries) {
  const sqlPath = path.join(migrationsRoot, dirent.name, "migration.sql")
  if (!fs.existsSync(sqlPath)) {
    console.error(`Missing migration.sql in src/main/db/migrations/${dirent.name}`)
    failed = true
  }
}

if (failed) {
  process.exit(1)
}

console.log(`OK: ${entries.length} Drizzle migration folder(s) under src/main/db/migrations`)
