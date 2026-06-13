CREATE TABLE `apartado_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`apartado_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`payment_method` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`apartado_id`) REFERENCES `apartados`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `apartado_payments_apartado_idx` ON `apartado_payments` (`apartado_id`);--> statement-breakpoint
CREATE TABLE `apartados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`consecutive` integer NOT NULL,
	`customer_name` text NOT NULL,
	`customer_phone` text NOT NULL,
	`description` text NOT NULL,
	`total_amount` integer NOT NULL,
	`status` text DEFAULT 'activo' NOT NULL,
	`notes` text,
	`deleted_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `apartados_phone_idx` ON `apartados` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `apartados_status_idx` ON `apartados` (`status`);