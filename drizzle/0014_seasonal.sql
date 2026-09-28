ALTER TABLE `bill` ADD `anomaly_basis` text;--> statement-breakpoint
ALTER TABLE `service` ADD `seasonal` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Electricity and gas change with the seasons (heating, cooling, solar).
UPDATE `service` SET `seasonal` = 1 WHERE `type_slug` IN ('electricity', 'gas');
