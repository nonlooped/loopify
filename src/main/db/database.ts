import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { app } from "electron"
import log from "electron-log/main.js"
import * as schema from "./schema"

export type DatabaseConnection = Database.Database

/**
 * Drizzle only skips migrations already recorded by folder name in __drizzle_migrations.
 * After a migration squash/rename, old journal rows no longer match bundled folder names,
 * so pending "baseline" migrations would re-run on an existing schema (duplicate table errors).
 */
function listBundledMigrationFolderNames(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) return []

  const names = readdirSync(migrationsDir).filter((entry) =>
    existsSync(join(migrationsDir, entry, "migration.sql"))
  )
  names.sort((a, b) => a.localeCompare(b))
  return names
}

function countUserTables(db: DatabaseConnection): number {
  const row = db
    .prepare(
      `select count(*) as c from sqlite_master
       where type = 'table'
         and name not in ('sqlite_sequence', '__drizzle_migrations')`
    )
    .get() as { c: number }
  return row.c
}

function appliedMigrationNames(db: DatabaseConnection): Set<string> {
  const journal = db
    .prepare(
      `select count(*) as c from sqlite_master where type = 'table' and name = '__drizzle_migrations'`
    )
    .get() as { c: number }
  if (journal.c === 0) return new Set()

  const rows = db.prepare(`select name from __drizzle_migrations order by id`).all() as {
    name: string | null
  }[]
  return new Set(rows.map((r) => r.name).filter((n): n is string => Boolean(n)))
}

function shouldResetDatabaseBeforeMigrate(db: DatabaseConnection, bundledNames: string[]): boolean {
  if (bundledNames.length === 0) return false

  const appliedNames = appliedMigrationNames(db)
  const bundledSet = new Set(bundledNames)
  const pending = bundledNames.filter((n) => !appliedNames.has(n))

  if (pending.length === 0) return false

  const tables = countUserTables(db)
  if (tables === 0) return false

  const appliedFromThisBundle = [...appliedNames].some((n) => bundledSet.has(n))
  if (!appliedFromThisBundle && appliedNames.size > 0) {
    return true
  }

  if (appliedNames.size === 0 && tables > 0) {
    return true
  }

  return false
}

function getDatabasePaths() {
  const dir = join(app.getPath("userData"), "data")
  const dbPath = join(dir, "loopify.db")
  return {
    dataDir: dir,
    dbPath,
    walPath: `${dbPath}-wal`,
    shmPath: `${dbPath}-shm`,
    copiedMigrationsDir: join(dir, "migrations"),
  }
}

function getBundledMigrationsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, "drizzle", "migrations")
  }

  return join(app.getAppPath(), "drizzle", "migrations")
}

function applyPragmas(db: DatabaseConnection): void {
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  db.pragma("synchronous = NORMAL")
  db.pragma("temp_store = MEMORY")
  db.pragma("cache_size = -20000")
}

/** Deletes the on-disk DB and copied migrations cache (no open DB handle required). */
export function removeLocalDatabaseFiles(): void {
  const { dataDir, dbPath, walPath, shmPath, copiedMigrationsDir } = getDatabasePaths()

  if (existsSync(dbPath)) {
    rmSync(dbPath, { force: true })
  }
  if (existsSync(walPath)) {
    rmSync(walPath, { force: true })
  }
  if (existsSync(shmPath)) {
    rmSync(shmPath, { force: true })
  }
  if (existsSync(copiedMigrationsDir)) {
    rmSync(copiedMigrationsDir, { recursive: true, force: true })
  }

  // Legacy: older builds stored journal metadata here; safe to remove if present.
  const legacyJournal = join(dataDir, "loopify.db-journal")
  if (existsSync(legacyJournal)) {
    rmSync(legacyJournal, { force: true })
  }
}

export function createDatabase(): DatabaseConnection {
  const paths = getDatabasePaths()
  mkdirSync(paths.dataDir, { recursive: true })

  const sourceMigrationsDir = getBundledMigrationsDir()
  const bundledNames = listBundledMigrationFolderNames(sourceMigrationsDir)

  let db = new Database(paths.dbPath)
  applyPragmas(db)

  if (shouldResetDatabaseBeforeMigrate(db, bundledNames)) {
    log.info(
      "Local database journal does not match bundled migrations (e.g. after a migration squash); resetting."
    )
    db.close()
    removeLocalDatabaseFiles()
    db = new Database(paths.dbPath)
    applyPragmas(db)
  }

  try {
    runMigrations(db)
  } catch (firstError) {
    log.warn(
      "Database migration failed; wiping local database files and retrying once.",
      firstError
    )
    db.close()
    removeLocalDatabaseFiles()
    db = new Database(paths.dbPath)
    applyPragmas(db)
    runMigrations(db)
  }

  return db
}

export function createDrizzleDatabase(db: DatabaseConnection) {
  return drizzle({ client: db, schema })
}

function runMigrations(db: DatabaseConnection): void {
  const { copiedMigrationsDir } = getDatabasePaths()
  const sourceMigrationsDir = getBundledMigrationsDir()

  if (!hasMigrationFiles(sourceMigrationsDir)) {
    throw new Error(`Drizzle migrations were not found at ${sourceMigrationsDir}`)
  }

  rmSync(copiedMigrationsDir, { recursive: true, force: true })
  cpSync(sourceMigrationsDir, copiedMigrationsDir, { recursive: true })

  const drizzleDb = drizzle({ client: db, schema })
  migrate(drizzleDb, { migrationsFolder: copiedMigrationsDir })

  db.pragma("wal_checkpoint(TRUNCATE)")
}

function hasMigrationFiles(dir: string): boolean {
  if (!existsSync(dir)) return false

  for (const entry of readdirSync(dir)) {
    const migrationPath = join(dir, entry, "migration.sql")
    if (existsSync(migrationPath)) {
      return true
    }
  }

  return false
}
