CREATE TABLE `access_request` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	`decided_by_account_id` text,
	`outcome` text
);
--> statement-breakpoint
CREATE INDEX `access_request_email_idx` ON `access_request` (`email`);--> statement-breakpoint
CREATE TABLE `allowed_signup` (
	`email` text PRIMARY KEY NOT NULL,
	`note` text,
	`added_by_account_id` text,
	`added_at` text NOT NULL,
	`used_at` text
);
--> statement-breakpoint
CREATE TABLE `install_setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
