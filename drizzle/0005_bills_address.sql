ALTER TABLE `household` ADD `bills_alias` text;--> statement-breakpoint
CREATE UNIQUE INDEX `household_bills_alias_unique` ON `household` (`bills_alias`);