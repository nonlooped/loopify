CREATE TABLE `import_items` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text NOT NULL,
	`source_url` text NOT NULL,
	`track_id` text,
	`status` text NOT NULL,
	`error` text,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_import_items_import` ON `import_items` (`import_id`);--> statement-breakpoint
CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`target_playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_imports_status` ON `imports` (`status`);--> statement-breakpoint
CREATE INDEX `idx_imports_created` ON `imports` (`created_at`);--> statement-breakpoint
CREATE TABLE `lyrics_cache` (
	`id` text PRIMARY KEY NOT NULL,
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
	`fetched_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_lyrics_cache_canonical` ON `lyrics_cache` (`canonical_url`,`provider`);--> statement-breakpoint
CREATE TABLE `play_history` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text,
	`source_url` text NOT NULL,
	`played_at` integer NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_play_history_track` ON `play_history` (`track_id`,`played_at`);--> statement-breakpoint
CREATE INDEX `idx_play_history_recent` ON `play_history` (`played_at`);--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`added_at` integer NOT NULL,
	`added_from` text,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_playlist_tracks_playlist` ON `playlist_tracks` (`playlist_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `idx_playlist_tracks_track` ON `playlist_tracks` (`track_id`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_playlists_sort` ON `playlists` (`sort_order`);--> statement-breakpoint
CREATE TABLE `queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text,
	`source_url` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_queue_items_order` ON `queue_items` (`sort_order`,`created_at`);--> statement-breakpoint
CREATE TABLE `resolver_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`source_url` text NOT NULL,
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
CREATE INDEX `idx_resolver_cache_source` ON `resolver_cache` (`source_url`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `track_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`provider` text NOT NULL,
	`source_url` text NOT NULL,
	`source_id` text,
	`extractor` text,
	`last_resolved_at` integer,
	`last_status` text DEFAULT 'new' NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_sources_source_url_unique` ON `track_sources` (`source_url`);--> statement-breakpoint
CREATE INDEX `idx_track_sources_url` ON `track_sources` (`source_url`);--> statement-breakpoint
CREATE INDEX `idx_track_sources_track` ON `track_sources` (`track_id`);--> statement-breakpoint
CREATE INDEX `idx_track_sources_provider_id` ON `track_sources` (`provider`,`source_id`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text,
	`album` text,
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
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tracks_canonical_url` ON `tracks` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `idx_tracks_liked_at` ON `tracks` (`liked_at`);--> statement-breakpoint
CREATE INDEX `idx_tracks_download_status` ON `tracks` (`download_status`);--> statement-breakpoint
CREATE INDEX `idx_tracks_provider_source` ON `tracks` (`provider`,`canonical_url`);