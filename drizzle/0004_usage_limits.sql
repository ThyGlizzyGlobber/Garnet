CREATE TABLE `usage` (
	`household_id` text NOT NULL,
	`month` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_household_month_kind_unique` ON `usage` (`household_id`,`month`,`kind`);