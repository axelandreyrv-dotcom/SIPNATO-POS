PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_admin` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`password_hash` text NOT NULL,
	`recovery_code_hash` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT "admin_single_row" CHECK(id = 1)
);
--> statement-breakpoint
INSERT INTO `__new_admin`("id", "password_hash", "recovery_code_hash", "created_at", "updated_at") SELECT "id", "password_hash", "recovery_code_hash", "created_at", "updated_at" FROM `admin`;--> statement-breakpoint
DROP TABLE `admin`;--> statement-breakpoint
ALTER TABLE `__new_admin` RENAME TO `admin`;--> statement-breakpoint
PRAGMA foreign_keys=ON;