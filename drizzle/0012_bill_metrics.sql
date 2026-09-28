CREATE TABLE `bill_metric` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`value` real,
	`unit` text,
	`amount_minor` integer,
	`currency` text,
	`period_start` text,
	`period_end` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bill_id`) REFERENCES `bill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bill_metric_bill_idx` ON `bill_metric` (`bill_id`);--> statement-breakpoint
CREATE INDEX `bill_metric_household_key_idx` ON `bill_metric` (`household_id`,`key`);--> statement-breakpoint
ALTER TABLE `bill` ADD `metrics_read_at` text;