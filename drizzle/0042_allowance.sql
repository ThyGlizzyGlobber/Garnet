ALTER TABLE `household` ADD `address` text;--> statement-breakpoint
ALTER TABLE `household` ADD `allowance_minor` integer;--> statement-breakpoint
ALTER TABLE `household` ADD `allowance_period` text DEFAULT 'month' NOT NULL;