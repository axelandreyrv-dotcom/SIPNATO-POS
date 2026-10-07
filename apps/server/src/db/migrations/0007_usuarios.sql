CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text NOT NULL CHECK (`role` IN ('dueno', 'admin', 'cajero')),
	`secret_hash` text NOT NULL,
	`recovery_code_hash` text,
	`active` integer DEFAULT 1 NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_idx` ON `users` (`username`);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_single_dueno_idx` ON `users` (`role`) WHERE `role` = 'dueno';
--> statement-breakpoint
INSERT INTO `users` (`username`, `display_name`, `role`, `secret_hash`, `recovery_code_hash`, `created_at`, `updated_at`)
SELECT 'dueno', 'Dueño', 'dueno', `password_hash`, `recovery_code_hash`, `created_at`, `updated_at` FROM `admin`;
--> statement-breakpoint
DROP TABLE `admin`;
--> statement-breakpoint
DROP TABLE `sessions`;
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_active_at` text NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_idx` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
ALTER TABLE `audit_log` ADD `user_id` integer REFERENCES `users`(`id`);
--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'sales_delete_pin_hash';
