-- Ventas pagadas con dólares: USD recibidos (centavos), tipo de cambio usado
-- (centésimas de colón) y vuelto entregado en colones. NULL en las demás ventas.
ALTER TABLE `sales` ADD `usd_received_cents` integer;
--> statement-breakpoint
ALTER TABLE `sales` ADD `exchange_rate` integer;
--> statement-breakpoint
ALTER TABLE `sales` ADD `change_colones` integer;
--> statement-breakpoint
-- Snapshot de cierre de caja: ventas en dólares (valoradas en ₡), USD en caja y vueltos.
ALTER TABLE `cash_registers` ADD `total_sales_dolares` integer;
--> statement-breakpoint
ALTER TABLE `cash_registers` ADD `total_usd_cents` integer;
--> statement-breakpoint
ALTER TABLE `cash_registers` ADD `total_usd_change` integer;
--> statement-breakpoint
-- Avisos enviados a clientes por WhatsApp (quién, cuándo, de qué). Solo inserción.
CREATE TABLE `customer_notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`phone` text,
	`user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `customer_notifications_entity_idx` ON `customer_notifications` (`entity_type`, `entity_id`);
