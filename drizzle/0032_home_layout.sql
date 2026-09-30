CREATE TABLE `home_layout` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`device` text NOT NULL,
	`kind` text DEFAULT 'home' NOT NULL,
	`density` text DEFAULT 'standard' NOT NULL,
	`pages` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `home_layout_member_device_kind` ON `home_layout` (`member_id`,`device`,`kind`);