CREATE TABLE `artists` (
	`id` text PRIMARY KEY,
	`deezer_id` integer UNIQUE,
	`name` text NOT NULL,
	`picture_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `albums` (
	`id` text PRIMARY KEY,
	`deezer_id` integer UNIQUE,
	`title` text NOT NULL,
	`artist_id` text,
	`cover_url` text,
	`release_date` text,
	`track_count` integer,
	`album_type` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_albums_artist_id_artists_id_fk` FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`artist` text,
	`album` text,
	`artist_id` text,
	`album_id` text,
	`duration_ms` integer,
	`thumbnail_url` text,
	`canonical_url` text NOT NULL,
	`provider` text NOT NULL,
	`liked_at` integer,
	`download_status` text DEFAULT 'not-downloaded' NOT NULL,
	`download_progress` integer DEFAULT 0 NOT NULL,
	`downloaded_file_path` text,
	`download_error` text,
	`downloaded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_tracks_artist_id_artists_id_fk` FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_tracks_album_id_albums_id_fk` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `album_tracks` (
	`id` text PRIMARY KEY,
	`album_id` text NOT NULL,
	`track_id` text NOT NULL,
	`disc_number` integer,
	`track_number` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_album_tracks_album_id_albums_id_fk` FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_album_tracks_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`id` text PRIMARY KEY,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`added_at` integer NOT NULL,
	`added_from` text,
	CONSTRAINT `fk_playlist_tracks_playlist_id_playlists_id_fk` FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_playlist_tracks_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY,
	`input_url` text NOT NULL,
	`target_playlist_id` text,
	`playlist_title` text,
	`status` text NOT NULL,
	`phase` text DEFAULT 'queued' NOT NULL,
	`source_kind` text,
	`total` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`matched` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`truncated` integer DEFAULT 0 NOT NULL,
	`source_track_count` integer,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	`error_message` text,
	CONSTRAINT `fk_imports_target_playlist_id_playlists_id_fk` FOREIGN KEY (`target_playlist_id`) REFERENCES `playlists`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `import_items` (
	`id` text PRIMARY KEY,
	`import_id` text NOT NULL,
	`source_url` text NOT NULL,
	`track_id` text,
	`status` text NOT NULL,
	`error` text,
	CONSTRAINT `fk_import_items_import_id_imports_id_fk` FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_import_items_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `lyrics_cache` (
	`id` text PRIMARY KEY,
	`track_title` text NOT NULL,
	`artist` text,
	`album` text,
	`duration_ms` integer,
	`canonical_url` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`source` text,
	`provider_track_id` text,
	`synced_lyrics_json` text,
	`error_message` text,
	`fetched_at` integer NOT NULL,
	`expires_at` integer,
	`updated_at` integer DEFAULT (cast(strftime('%s','now') as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `play_history` (
	`id` text PRIMARY KEY,
	`track_id` text,
	`source_url` text NOT NULL,
	`played_at` integer NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_play_history_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `queue_items` (
	`id` text PRIMARY KEY,
	`track_id` text,
	`source_url` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_queue_items_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `recommendation_impressions` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`shown_at` integer NOT NULL,
	CONSTRAINT `fk_recommendation_impressions_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `recommendation_interactions` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`track_id` text NOT NULL,
	`interaction_type` text NOT NULL,
	`interacted_at` integer NOT NULL,
	`metadata_json` text,
	CONSTRAINT `fk_recommendation_interactions_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `resolver_cache` (
	`id` text PRIMARY KEY,
	`source_url` text NOT NULL UNIQUE,
	`provider` text NOT NULL,
	`stream_url` text,
	`metadata_json` text,
	`expires_at` integer,
	`stream_expires_at` integer,
	`failure_code` text,
	`failure_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `track_sources` (
	`id` text PRIMARY KEY,
	`track_id` text NOT NULL,
	`provider` text NOT NULL,
	`source_url` text NOT NULL UNIQUE,
	`source_id` text,
	`extractor` text,
	`last_resolved_at` integer,
	`last_status` text DEFAULT 'new' NOT NULL,
	CONSTRAINT `fk_track_sources_track_id_tracks_id_fk` FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_album_tracks_album` ON `album_tracks` (`album_id`);--> statement-breakpoint
CREATE INDEX `idx_album_tracks_track` ON `album_tracks` (`track_id`);--> statement-breakpoint
CREATE INDEX `idx_import_items_import` ON `import_items` (`import_id`);--> statement-breakpoint
CREATE INDEX `idx_import_items_track` ON `import_items` (`track_id`);--> statement-breakpoint
CREATE INDEX `idx_imports_status` ON `imports` (`status`);--> statement-breakpoint
CREATE INDEX `idx_imports_created` ON `imports` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_lyrics_cache_canonical` ON `lyrics_cache` (`canonical_url`,`provider`);--> statement-breakpoint
CREATE INDEX `idx_play_history_track` ON `play_history` (`track_id`,`played_at`);--> statement-breakpoint
CREATE INDEX `idx_play_history_recent` ON `play_history` (`played_at`);--> statement-breakpoint
CREATE INDEX `idx_playlist_tracks_playlist` ON `playlist_tracks` (`playlist_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_playlist_tracks_track` ON `playlist_tracks` (`track_id`);--> statement-breakpoint
CREATE INDEX `idx_playlist_tracks_playlist_id` ON `playlist_tracks` (`playlist_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_tracks_playlist_id_track_id_unique` ON `playlist_tracks` (`playlist_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `idx_playlists_sort` ON `playlists` (`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_queue_items_order` ON `queue_items` (`sort_order`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_queue_items_status` ON `queue_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_reco_impressions_session` ON `recommendation_impressions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_reco_impressions_track` ON `recommendation_impressions` (`track_id`,`shown_at`);--> statement-breakpoint
CREATE INDEX `idx_reco_impressions_time` ON `recommendation_impressions` (`shown_at`);--> statement-breakpoint
CREATE INDEX `idx_reco_interactions_session` ON `recommendation_interactions` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_reco_interactions_track` ON `recommendation_interactions` (`track_id`,`interacted_at`);--> statement-breakpoint
CREATE INDEX `idx_reco_interactions_type` ON `recommendation_interactions` (`interaction_type`,`interacted_at`);--> statement-breakpoint
CREATE INDEX `idx_track_sources_track` ON `track_sources` (`track_id`);--> statement-breakpoint
CREATE INDEX `idx_track_sources_provider_id` ON `track_sources` (`provider`,`source_id`);--> statement-breakpoint
CREATE INDEX `idx_tracks_canonical_url` ON `tracks` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `idx_tracks_liked_at` ON `tracks` (`liked_at`);--> statement-breakpoint
CREATE INDEX `idx_tracks_download_status` ON `tracks` (`download_status`);--> statement-breakpoint
CREATE INDEX `idx_tracks_provider_source` ON `tracks` (`provider`,`canonical_url`);--> statement-breakpoint
CREATE INDEX `idx_tracks_artist_id` ON `tracks` (`artist_id`);--> statement-breakpoint
CREATE INDEX `idx_tracks_album_id` ON `tracks` (`album_id`);
