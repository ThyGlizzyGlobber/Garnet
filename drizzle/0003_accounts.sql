-- Accounts, invites, sign-in codes and trusted devices. member gains account_id
-- and email, and pin_hash becomes nullable (members set their own PIN after
-- accepting an invite). Existing members keep their PIN and have no account yet.
-- Foreign keys are off during migrations (see runMigrations).
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`google_sub` text,
	`last_sign_in_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_email_unique` ON `account` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_google_sub_unique` ON `account` (`google_sub`);--> statement-breakpoint
CREATE TABLE `device` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`label` text,
	`pin_failures` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_token_unique` ON `device` (`token_hash`);--> statement-breakpoint
CREATE INDEX `device_account_idx` ON `device` (`account_id`);--> statement-breakpoint
CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`member_id` text NOT NULL,
	`email` text,
	`token_hash` text NOT NULL,
	`code_hash` text NOT NULL,
	`created_by_member_id` text,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`accepted_by_account_id` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`accepted_by_account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_token_unique` ON `invite` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `invite_code_unique` ON `invite` (`code_hash`);--> statement-breakpoint
CREATE INDEX `invite_member_idx` ON `invite` (`member_id`);--> statement-breakpoint
CREATE TABLE `login_code` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_code_email_idx` ON `login_code` (`email`);--> statement-breakpoint
CREATE TABLE `__new_member` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text,
	`email` text,
	`name` text NOT NULL,
	`pin_hash` text,
	`role` text DEFAULT 'member' NOT NULL,
	`split_weight` real DEFAULT 1 NOT NULL,
	`active_from` text NOT NULL,
	`active_to` text,
	`colour` text DEFAULT '#0a84ff' NOT NULL,
	`payment_details` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_member`("id", "household_id", "account_id", "email", "name", "pin_hash", "role", "split_weight", "active_from", "active_to", "colour", "payment_details", "created_at", "updated_at") SELECT "id", "household_id", NULL, NULL, "name", "pin_hash", "role", "split_weight", "active_from", "active_to", "colour", "payment_details", "created_at", "updated_at" FROM `member`;--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `__new_member` RENAME TO `member`;--> statement-breakpoint
CREATE UNIQUE INDEX `member_household_name_unique` ON `member` (`household_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `member_household_account_unique` ON `member` (`household_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `member_account_idx` ON `member` (`account_id`);