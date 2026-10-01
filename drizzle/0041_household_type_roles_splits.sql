ALTER TABLE `household` ADD `type` text;--> statement-breakpoint
ALTER TABLE `service` ADD `not_split_with` text DEFAULT '[]' NOT NULL;