CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`ref_id` text NOT NULL,
	`sent_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_once` ON `notification_log` (`member_id`,`kind`,`ref_id`);--> statement-breakpoint
ALTER TABLE `member` ADD `notify_bills` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `member` ADD `notify_reminders` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `member` ADD `notify_problems` integer DEFAULT true NOT NULL;