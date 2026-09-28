CREATE TABLE `household_consent` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`kind` text NOT NULL,
	`granted` integer NOT NULL,
	`how` text NOT NULL,
	`notice_version` text NOT NULL,
	`by_member_id` text,
	`at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `household_consent_household_idx` ON `household_consent` (`household_id`,`kind`);--> statement-breakpoint
CREATE TABLE `regional_stat` (
	`level` text NOT NULL,
	`area` text NOT NULL,
	`service_type` text NOT NULL,
	`month` text NOT NULL,
	`size_band` text NOT NULL,
	`metric` text NOT NULL,
	`unit` text NOT NULL,
	`households` integer NOT NULL,
	`median` real NOT NULL,
	`p25` real NOT NULL,
	`p75` real NOT NULL,
	`computed_at` text NOT NULL,
	PRIMARY KEY(`level`, `area`, `service_type`, `month`, `size_band`, `metric`)
);
--> statement-breakpoint
ALTER TABLE `household` ADD `share_regional` integer DEFAULT true NOT NULL;