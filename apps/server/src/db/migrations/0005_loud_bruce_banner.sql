CREATE TABLE `factura_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`factura_id` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`description` text NOT NULL,
	`unit_price` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`factura_id`) REFERENCES `facturas`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `factura_items_factura_idx` ON `factura_items` (`factura_id`);--> statement-breakpoint
CREATE TABLE `facturas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`consecutive` integer NOT NULL,
	`date` text NOT NULL,
	`client_name` text NOT NULL,
	`client_cedula` text,
	`iva_percent` integer DEFAULT 0 NOT NULL,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`iva_amount` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'activa' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `facturas_consecutive_idx` ON `facturas` (`consecutive`);--> statement-breakpoint
CREATE INDEX `facturas_status_idx` ON `facturas` (`status`);