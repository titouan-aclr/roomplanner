CREATE TABLE `invites` (
	`code` text PRIMARY KEY NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	`used_by` integer,
	`used_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`used_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `layouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`owner_id` integer NOT NULL,
	`name` text NOT NULL,
	`items` text NOT NULL,
	`initial` text NOT NULL,
	`notes` text,
	`parent_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `layouts_room_idx` ON `layouts` (`room_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pseudo` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_pseudo_unique` ON `users` (`pseudo`);--> statement-breakpoint
CREATE TABLE `votes` (
	`user_id` integer NOT NULL,
	`layout_id` integer NOT NULL,
	`value` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `layout_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`layout_id`) REFERENCES `layouts`(`id`) ON UPDATE no action ON DELETE cascade
);
