CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`account_id` text,
	`email` text,
	`action` text NOT NULL,
	`target_kind` text,
	`target_id` text,
	`target_name` text,
	`detail` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `audit_log_at_idx` ON `audit_log` (`at`);