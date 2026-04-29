import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { app } from "electron"
import * as schema from "./schema"

export type DatabaseConnection = Database.Database

export function createDatabase(): DatabaseConnection {
  const dir = join(app.getPath("userData"), "data")
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, "loopify.db")

  const db = new Database(dbPath)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")

  runMigrations(db)

  return db
}

export function createDrizzleDatabase(db: DatabaseConnection) {
  return drizzle(db, { schema })
}

function runMigrations(db: DatabaseConnection): void {
  const dbDir = join(app.getPath("userData"), "data")
  const migrationsDir = join(dbDir, "migrations")

  const sourceMigrationsDir = join(app.getAppPath(), "drizzle", "migrations")

  baselineExistingDatabase(db)

  if (existsSync(sourceMigrationsDir)) {
    mkdirSync(migrationsDir, { recursive: true })
    const files = readdirSync(sourceMigrationsDir)
    for (const file of files) {
      const sourcePath = join(sourceMigrationsDir, file)
      const destPath = join(migrationsDir, file)
      copyFileSync(sourcePath, destPath)
    }
  }

  const drizzleDb = drizzle(db, { schema })
  migrate(drizzleDb, { migrationsFolder: migrationsDir })
}

function baselineExistingDatabase(db: DatabaseConnection): void {
  const hasDrizzleMigrations = db
    .prepare(
      "select count(*) as cnt from sqlite_master where type = 'table' and name = '__drizzle_migrations'"
    )
    .get() as { cnt: number }

  if (hasDrizzleMigrations.cnt > 0) return

  const hasTracks = db
    .prepare("select count(*) as cnt from sqlite_master where type = 'table' and name = 'tracks'")
    .get() as { cnt: number }

  if (hasTracks.cnt === 0) return

  db.exec(`
    create table if not exists __drizzle_migrations (
      id integer primary key autoincrement,
      hash text not null,
      created_at integer
    )
  `)

  const INITIAL_MIGRATION_HASH = "3f2abf49ea81d083196bc3f9d29efffd93c9c24ebf75e9fc7a358b8f0692f34e"
  const INITIAL_MIGRATION_TIMESTAMP = 1777490806125

  db.prepare("insert into __drizzle_migrations (hash, created_at) values (?, ?)").run(
    INITIAL_MIGRATION_HASH,
    INITIAL_MIGRATION_TIMESTAMP
  )
}

export function deleteDatabase(): void {
  const dir = join(app.getPath("userData"), "data")
  const dbPath = join(dir, "loopify.db")
  const walPath = `${dbPath}-wal`
  const shmPath = `${dbPath}-shm`

  if (existsSync(dbPath)) {
    rmSync(dbPath, { force: true })
  }
  if (existsSync(walPath)) {
    rmSync(walPath, { force: true })
  }
  if (existsSync(shmPath)) {
    rmSync(shmPath, { force: true })
  }
}
