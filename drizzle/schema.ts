import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artist: text("artist"),
  album: text("album"),
  durationMs: integer("duration_ms"),
  thumbnailUrl: text("thumbnail_url"),
  canonicalUrl: text("canonical_url").notNull(),
  provider: text("provider").notNull(),
  likedAt: integer("liked_at"),
  downloadStatus: text("download_status").notNull().default("not-downloaded"),
  downloadProgress: integer("download_progress").notNull().default(0),
  downloadedFilePath: text("downloaded_file_path"),
  downloadError: text("download_error"),
  downloadedAt: integer("downloaded_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const trackSources = sqliteTable(
  "track_sources",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceId: text("source_id"),
    extractor: text("extractor"),
    lastResolvedAt: integer("last_resolved_at"),
    lastStatus: text("last_status").notNull().default("new"),
  },
  (table) => ({
    sourceUrlIdx: uniqueIndex("track_sources_source_url_idx").on(table.sourceUrl),
  })
)

export const resolverCache = sqliteTable("resolver_cache", {
  id: text("id").primaryKey(),
  sourceUrl: text("source_url").notNull(),
  provider: text("provider").notNull(),
  streamUrl: text("stream_url"),
  metadataJson: text("metadata_json"),
  expiresAt: integer("expires_at"),
  streamExpiresAt: integer("stream_expires_at"),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const playlists = sqliteTable("playlists", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const playlistTracks = sqliteTable("playlist_tracks", {
  id: text("id").primaryKey(),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => playlists.id, { onDelete: "cascade" }),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  addedAt: integer("added_at").notNull(),
  addedFrom: text("added_from"),
})

export const queueItems = sqliteTable("queue_items", {
  id: text("id").primaryKey(),
  trackId: text("track_id").references(() => tracks.id, { onDelete: "set null" }),
  sourceUrl: text("source_url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status").notNull().default("queued"),
  createdAt: integer("created_at").notNull(),
})

export const imports = sqliteTable("imports", {
  id: text("id").primaryKey(),
  inputUrl: text("input_url").notNull(),
  targetPlaylistId: text("target_playlist_id").references(() => playlists.id, {
    onDelete: "set null",
  }),
  playlistTitle: text("playlist_title"),
  status: text("status").notNull(),
  phase: text("phase").notNull().default("queued"),
  sourceKind: text("source_kind"),
  total: integer("total").notNull().default(0),
  completed: integer("completed").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  matched: integer("matched").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  truncated: integer("truncated", { mode: "boolean" }).notNull().default(false),
  sourceTrackCount: integer("source_track_count"),
  createdAt: integer("created_at").notNull(),
  finishedAt: integer("finished_at"),
  errorMessage: text("error_message"),
})

export const importItems = sqliteTable("import_items", {
  id: text("id").primaryKey(),
  importId: text("import_id")
    .notNull()
    .references(() => imports.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  trackId: text("track_id").references(() => tracks.id, { onDelete: "set null" }),
  status: text("status").notNull(),
  error: text("error"),
})

export const playHistory = sqliteTable("play_history", {
  id: text("id").primaryKey(),
  trackId: text("track_id").references(() => tracks.id, { onDelete: "set null" }),
  sourceUrl: text("source_url").notNull(),
  playedAt: integer("played_at").notNull(),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
})

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
})
