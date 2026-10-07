CREATE TABLE `business_profile` (
	`id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
	`template` text NOT NULL,
	`orders_label` text NOT NULL,
	`item_label` text NOT NULL,
	`fields` text NOT NULL,
	`modules` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
-- Todo negocio existente al migrar es un taller de celulares: mismo comportamiento que antes.
-- Debe coincidir con TEMPLATE_INFO.celulares (packages/shared/src/schemas/business.ts).
-- En un negocio nuevo, /auth/setup reemplaza esta fila con la plantilla elegida.
INSERT INTO `business_profile` (`id`, `template`, `orders_label`, `item_label`, `fields`, `modules`, `updated_at`) VALUES (
	1, 'celulares', 'Boletas', 'Modelo del equipo',
	'[{"key":"imei","label":"IMEI","type":"imei","required":false},{"key":"clave","label":"Contraseña o patrón","type":"secret","required":false}]',
	'["ordenes","cotizaciones","facturas","creditos","inventario"]',
	strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
--> statement-breakpoint
ALTER TABLE `boletas` ADD `fields` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `boletas` SET `fields` = (
	SELECT json_group_array(json(v)) FROM (
		SELECT json_object('key', 'imei', 'label', 'IMEI', 'value', `boletas`.`imei`) AS v
		WHERE `boletas`.`imei` IS NOT NULL AND `boletas`.`imei` <> ''
		UNION ALL
		SELECT json_object('key', 'clave', 'label', 'Contraseña o patrón', 'value', `boletas`.`unlock_password`)
		WHERE `boletas`.`unlock_password` IS NOT NULL AND `boletas`.`unlock_password` <> ''
	)
);
--> statement-breakpoint
DROP INDEX `boletas_imei_idx`;
--> statement-breakpoint
ALTER TABLE `boletas` DROP COLUMN `imei`;
--> statement-breakpoint
ALTER TABLE `boletas` DROP COLUMN `unlock_password`;
