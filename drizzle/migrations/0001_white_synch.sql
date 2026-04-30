CREATE TABLE `album_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`album_id` text NOT NULL,
	`track_id` text NOT NULL,
	`disc_number` integer,
	`track_number` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`album_id`) REFERENCES `albums`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_album_tracks_album` ON `album_tracks` (`album_id`);--> statement-breakpoint
CREATE INDEX `idx_album_tracks_track` ON `album_tracks` (`track_id`);--> statement-breakpoint
CREATE TABLE `albums` (
	`id` text PRIMARY KEY NOT NULL,
	`deezer_id` integer,
	`title` text NOT NULL,
	`artist_id` text,
	`cover_url` text,
	`release_date` text,
	`track_count` integer,
	`album_type` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artist_id`) REFERENCES `artists`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `albums_deezer_id_unique` ON `albums` (`deezer_id`);--> statement-breakpoint
CREATE INDEX `idx_albums_deezer_id` ON `albums` (`deezer_id`);--> statement-breakpoint
CREATE TABLE `artists` (
	`id` text PRIMARY KEY NOT NULL,
	`deezer_id` integer,
	`name` text NOT NULL,
	`picture_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artists_deezer_id_unique` ON `artists` (`deezer_id`);--> statement-breakpoint
CREATE INDEX `idx_artists_deezer_id` ON `artists` (`deezer_id`);--> statement-breakpoint
ALTER TABLE `tracks` ADD `artist_id` text REFERENCES artists(id);--> statement-breakpoint
ALTER TABLE `tracks` ADD `album_id` text REFERENCES albums(id);--> statement-breakpoint
CREATE INDEX `idx_tracks_artist_id` ON `tracks` (`artist_id`);--> statement-breakpoint
CREATE INDEX `idx_tracks_album_id` ON `tracks` (`album_id`);