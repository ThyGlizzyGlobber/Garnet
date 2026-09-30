CREATE TABLE `asset` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`identifier` text,
	`identifier_key` text,
	`owner_member_id` text,
	`created_by_member_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `asset_household_idx` ON `asset` (`household_id`);--> statement-breakpoint
CREATE INDEX `asset_identifier_idx` ON `asset` (`household_id`,`identifier_key`);--> statement-breakpoint
ALTER TABLE `bill` ADD `asset_id` text REFERENCES asset(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `bill` ADD `asset_refs` text;--> statement-breakpoint
CREATE INDEX `bill_asset_idx` ON `bill` (`asset_id`);