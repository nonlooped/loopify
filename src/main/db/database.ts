import { mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import Database from "better-sqlite3"
import { app } from "electron"

export type DatabaseConnection = Database.Database

export function createDatabase(): DatabaseConnection {
  const dir = join(app.getPath("userData"), "data")
  mkdirSync(dir, { recursive: true })
  const db = new Database(join(dir, "loopify.db"))
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  runMigrations(db)
  return db
}

function runMigrations(db: DatabaseConnection): void {
  db.exec(`
    create table if not exists tracks (
      id text primary key,
      title text not null,
      artist text,
      album text,
      duration_ms integer,
      thumbnail_url text,
      canonical_url text not null,
      provider text not null,
      liked_at integer,
      download_status text not null default 'not-downloaded',
      download_progress integer not null default 0,
      downloaded_file_path text,
      download_error text,
      downloaded_at integer,
      created_at integer not null,
      updated_at integer not null
    );
    create table if not exists track_sources (
      id text primary key,
      track_id text not null references tracks(id) on delete cascade,
      provider text not null,
      source_url text not null unique,
      source_id text,
      extractor text,
      last_resolved_at integer,
      last_status text not null default 'new'
    );
    create table if not exists resolver_cache (
      id text primary key,
      source_url text not null,
      provider text not null,
      stream_url text,
      metadata_json text,
      expires_at integer,
      stream_expires_at integer,
      failure_code text,
      failure_message text,
      created_at integer not null,
      updated_at integer not null
    );
    create table if not exists playlists (
      id text primary key,
      name text not null,
      description text,
      sort_order integer not null default 0,
      created_at integer not null,
      updated_at integer not null
    );
    create table if not exists playlist_tracks (
      id text primary key,
      playlist_id text not null references playlists(id) on delete cascade,
      track_id text not null references tracks(id) on delete cascade,
      sort_order integer not null default 0,
      added_at integer not null,
      added_from text
    );
    create table if not exists queue_items (
      id text primary key,
      track_id text references tracks(id) on delete set null,
      source_url text not null,
      sort_order integer not null default 0,
      status text not null default 'queued',
      created_at integer not null
    );
    create table if not exists imports (
      id text primary key,
      input_url text not null,
      target_playlist_id text references playlists(id) on delete set null,
      playlist_title text,
      status text not null,
      phase text not null default 'queued',
      source_kind text,
      total integer not null default 0,
      completed integer not null default 0,
      failed integer not null default 0,
      matched integer not null default 0,
      skipped integer not null default 0,
      truncated integer not null default 0,
      source_track_count integer,
      created_at integer not null,
      finished_at integer,
      error_message text
    );
    create table if not exists import_items (
      id text primary key,
      import_id text not null references imports(id) on delete cascade,
      source_url text not null,
      track_id text references tracks(id) on delete set null,
      status text not null,
      error text
    );
    create table if not exists play_history (
      id text primary key,
      track_id text references tracks(id) on delete set null,
      source_url text not null,
      played_at integer not null,
      completed integer not null default 0
    );
    create table if not exists lyrics_cache (
      id text primary key,
      track_title text not null,
      artist text,
      album text,
      duration_ms integer,
      canonical_url text not null,
      provider text not null,
      status text not null,
      source text,
      provider_track_id text,
      synced_lyrics_json text,
      error_message text,
      fetched_at integer not null
    );
    create table if not exists settings (
      key text primary key,
      value text not null,
      updated_at integer not null
    );
  `)

  ensureImportsColumns(db)
  ensureTrackColumns(db)
  ensureResolverCacheStreamColumns(db)
  ensureLyricsCacheTable(db)

  const dbDir = dirname(db.name)
  mkdirSync(dbDir, { recursive: true })
}

function ensureTrackColumns(db: DatabaseConnection): void {
  const columns = db.prepare("pragma table_info(tracks)").all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))
  if (!names.has("liked_at")) {
    db.exec("alter table tracks add column liked_at integer")
  }
  if (!names.has("download_status")) {
    db.exec("alter table tracks add column download_status text not null default 'not-downloaded'")
  }
  if (!names.has("download_progress")) {
    db.exec("alter table tracks add column download_progress integer not null default 0")
  }
  if (!names.has("downloaded_file_path")) {
    db.exec("alter table tracks add column downloaded_file_path text")
  }
  if (!names.has("download_error")) {
    db.exec("alter table tracks add column download_error text")
  }
  if (!names.has("downloaded_at")) {
    db.exec("alter table tracks add column downloaded_at integer")
  }
}

function ensureImportsColumns(db: DatabaseConnection): void {
  const columns = db.prepare("pragma table_info(imports)").all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))
  if (!names.has("playlist_title")) {
    db.exec("alter table imports add column playlist_title text")
  }
  if (!names.has("error_message")) {
    db.exec("alter table imports add column error_message text")
  }
  if (!names.has("phase")) {
    db.exec("alter table imports add column phase text default 'queued'")
    db.exec("update imports set phase = 'done' where status = 'done'")
    db.exec("update imports set phase = 'failed' where status = 'failed'")
    db.exec("update imports set phase = 'queued' where status = 'queued'")
    db.exec("update imports set phase = 'running' where status = 'running'")
  }
  if (!names.has("source_kind")) {
    db.exec("alter table imports add column source_kind text")
  }
  if (!names.has("matched")) {
    db.exec("alter table imports add column matched integer not null default 0")
  }
  if (!names.has("skipped")) {
    db.exec("alter table imports add column skipped integer not null default 0")
  }
  if (!names.has("truncated")) {
    db.exec("alter table imports add column truncated integer not null default 0")
  }
  if (!names.has("source_track_count")) {
    db.exec("alter table imports add column source_track_count integer")
  }
}

function ensureResolverCacheStreamColumns(db: DatabaseConnection): void {
  const columns = db.prepare("pragma table_info(resolver_cache)").all() as { name: string }[]
  const names = new Set(columns.map((c) => c.name))
  if (!names.has("stream_expires_at")) {
    db.exec("alter table resolver_cache add column stream_expires_at integer")
  }
}

function ensureLyricsCacheTable(db: DatabaseConnection): void {
  db.exec(`
    create table if not exists lyrics_cache (
      id text primary key,
      track_title text not null,
      artist text,
      album text,
      duration_ms integer,
      canonical_url text not null,
      provider text not null,
      status text not null,
      source text,
      provider_track_id text,
      synced_lyrics_json text,
      error_message text,
      fetched_at integer not null
    );
  `)
}
