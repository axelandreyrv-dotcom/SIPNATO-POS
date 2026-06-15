CREATE TABLE `creditos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`consecutive` integer NOT NULL,
	`debtor_name` text NOT NULL,
	`debtor_phone` text NOT NULL,
	`description` text NOT NULL,
	`total_amount` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'activo' NOT NULL,
	`deleted_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `creditos_phone_idx` ON `creditos` (`debtor_phone`);
--> statement-breakpoint
CREATE INDEX `creditos_status_idx` ON `creditos` (`status`);
--> statement-breakpoint
CREATE INDEX `creditos_due_date_idx` ON `creditos` (`due_date`);
--> statement-breakpoint
CREATE TABLE `credito_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`credito_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`credito_id`) REFERENCES `creditos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `credito_payments_credito_idx` ON `credito_payments` (`credito_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO `counters` (`type`, `current_value`) VALUES ('credito', 0);
