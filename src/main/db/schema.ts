import { sql } from "drizzle-orm"
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const artists = sqliteTable("artists", {
  id: text("id").primaryKey(),
  deezerId: integer("deezer_id").unique(),
  name: text("name").notNull(),
  pictureUrl: text("picture_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const albums = sqliteTable("albums", {
  id: text("id").primaryKey(),
  deezerId: integer("deezer_id").unique(),
  title: text("title").notNull(),
  artistId: text("artist_id").references(() => artists.id, { onDelete: "set null" }),
  coverUrl: text("cover_url"),
  releaseDate: text("release_date"),
  trackCount: integer("track_count"),
  albumType: text("album_type"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const tracks = sqliteTable(
  "tracks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    artist: text("artist"),
    album: text("album"),
    artistId: text("artist_id").references(() => artists.id, { onDelete: "set null" }),
    albumId: text("album_id").references(() => albums.id, { onDelete: "set null" }),
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
  },
  (table) => [
    index("idx_tracks_canonical_url").on(table.canonicalUrl),
    index("idx_tracks_liked_at").on(table.likedAt),
    index("idx_tracks_download_status").on(table.downloadStatus),
    index("idx_tracks_provider_source").on(table.provider, table.canonicalUrl),
    index("idx_tracks_artist_id").on(table.artistId),
    index("idx_tracks_album_id").on(table.albumId),
  ]
)

export const trackSources = sqliteTable(
  "track_sources",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    sourceUrl: text("source_url").notNull().unique(),
    sourceId: text("source_id"),
    extractor: text("extractor"),
    lastResolvedAt: integer("last_resolved_at"),
    lastStatus: text("last_status").notNull().default("new"),
  },
  (table) => [
    index("idx_track_sources_track").on(table.trackId),
    index("idx_track_sources_provider_id").on(table.provider, table.sourceId),
  ]
)

export const resolverCache = sqliteTable("resolver_cache", {
  id: text("id").primaryKey(),
  sourceUrl: text("source_url").notNull().unique(),
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

export const playlists = sqliteTable(
  "playlists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_playlists_sort").on(table.sortOrder)]
)

export const playlistTracks = sqliteTable(
  "playlist_tracks",
  {
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
  },
  (table) => [
    index("idx_playlist_tracks_playlist").on(table.playlistId, table.sortOrder),
    index("idx_playlist_tracks_track").on(table.trackId),
    index("idx_playlist_tracks_playlist_id").on(table.playlistId),
    uniqueIndex("playlist_tracks_playlist_id_track_id_unique").on(table.playlistId, table.trackId),
  ]
)

export const queueItems = sqliteTable(
  "queue_items",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id").references(() => tracks.id, { onDelete: "set null" }),
    sourceUrl: text("source_url").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: text("status").notNull().default("queued"),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_queue_items_order").on(table.sortOrder, table.createdAt),
    index("idx_queue_items_status").on(table.status),
  ]
)

export const imports = sqliteTable(
  "imports",
  {
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
    truncated: integer("truncated").notNull().default(0),
    sourceTrackCount: integer("source_track_count"),
    createdAt: integer("created_at").notNull(),
    finishedAt: integer("finished_at"),
    errorMessage: text("error_message"),
  },
  (table) => [
    index("idx_imports_status").on(table.status),
    index("idx_imports_created").on(table.createdAt),
  ]
)

export const playHistory = sqliteTable(
  "play_history",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id").references(() => tracks.id, { onDelete: "set null" }),
    sourceUrl: text("source_url").notNull(),
    playedAt: integer("played_at").notNull(),
    completed: integer("completed").notNull().default(0),
  },
  (table) => [
    index("idx_play_history_track").on(table.trackId, table.playedAt),
    index("idx_play_history_recent").on(table.playedAt),
  ]
)

export const lyricsCache = sqliteTable(
  "lyrics_cache",
  {
    id: text("id").primaryKey(),
    trackTitle: text("track_title").notNull(),
    artist: text("artist"),
    album: text("album"),
    durationMs: integer("duration_ms"),
    canonicalUrl: text("canonical_url").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    source: text("source"),
    providerTrackId: text("provider_track_id"),
    syncedLyricsJson: text("synced_lyrics_json"),
    errorMessage: text("error_message"),
    fetchedAt: integer("fetched_at").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(cast(strftime('%s','now') as integer))`),
  },
  (table) => [index("idx_lyrics_cache_canonical").on(table.canonicalUrl, table.provider)]
)

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
})

export const recommendationImpressions = sqliteTable(
  "recommendation_impressions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    shownAt: integer("shown_at").notNull(),
  },
  (table) => [
    index("idx_reco_impressions_session").on(table.sessionId),
    index("idx_reco_impressions_track").on(table.trackId, table.shownAt),
    index("idx_reco_impressions_time").on(table.shownAt),
  ]
)

export const recommendationInteractions = sqliteTable(
  "recommendation_interactions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    interactionType: text("interaction_type").notNull(),
    interactedAt: integer("interacted_at").notNull(),
    metadataJson: text("metadata_json"),
  },
  (table) => [
    index("idx_reco_interactions_session").on(table.sessionId),
    index("idx_reco_interactions_track").on(table.trackId, table.interactedAt),
    index("idx_reco_interactions_type").on(table.interactionType, table.interactedAt),
  ]
)
