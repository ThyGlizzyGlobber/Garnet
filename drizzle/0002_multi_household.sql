-- Several households per install: every household-owned table gains household_id
-- (FK → household, ON DELETE CASCADE). SQLite can't add a NOT NULL foreign-key
-- column to tables with rows, so each table is rebuilt (SQLite's documented
-- 12-step procedure). runMigrations() turns foreign_keys OFF around migrations
-- and runs foreign_key_check before committing, so the DROP TABLEs below never
-- cascade. Existing rows belong to the one household that existed before.
ALTER TABLE `household` ADD `is_demo` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE `__new_member` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`split_weight` real DEFAULT 1 NOT NULL,
	`active_from` text NOT NULL,
	`active_to` text,
	`colour` text DEFAULT '#0a84ff' NOT NULL,
	`payment_details` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_member` (`id`, `name`, `pin_hash`, `role`, `split_weight`, `active_from`, `active_to`, `colour`, `payment_details`, `created_at`, `updated_at`, `household_id`)
  SELECT `id`, `name`, `pin_hash`, `role`, `split_weight`, `active_from`, `active_to`, `colour`, `payment_details`, `created_at`, `updated_at`, (SELECT `id` FROM `household` ORDER BY `created_at`, `id` LIMIT 1) FROM `member`;--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `__new_member` RENAME TO `member`;--> statement-breakpoint
CREATE UNIQUE INDEX `member_household_name_unique` ON `member` (`household_id`,`name`);--> statement-breakpoint
CREATE TABLE `__new_service` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`type_slug` text NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`account_ref` text,
	`cadence` text DEFAULT 'monthly' NOT NULL,
	`usage_unit` text,
	`split_mode` text DEFAULT 'equal' NOT NULL,
	`payer_member_id` text,
	`colour` text DEFAULT '#0a84ff' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_slug`) REFERENCES `service_type`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_service` (`id`, `type_slug`, `name`, `provider`, `account_ref`, `cadence`, `usage_unit`, `split_mode`, `payer_member_id`, `colour`, `is_active`, `notes`, `created_at`, `updated_at`, `household_id`)
  SELECT `id`, `type_slug`, `name`, `provider`, `account_ref`, `cadence`, `usage_unit`, `split_mode`, `payer_member_id`, `colour`, `is_active`, `notes`, `created_at`, `updated_at`, (SELECT `id` FROM `household` ORDER BY `created_at`, `id` LIMIT 1) FROM `service`;--> statement-breakpoint
DROP TABLE `service`;--> statement-breakpoint
ALTER TABLE `__new_service` RENAME TO `service`;--> statement-breakpoint
CREATE INDEX `service_type_idx` ON `service` (`type_slug`);--> statement-breakpoint
CREATE INDEX `service_household_idx` ON `service` (`household_id`);--> statement-breakpoint
CREATE TABLE `__new_service_split` (
	`household_id` text NOT NULL,
	`service_id` text NOT NULL,
	`member_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_service_split` (`service_id`, `member_id`, `weight`, `household_id`)
  SELECT `service_id`, `member_id`, `weight`, (SELECT `id` FROM `household` ORDER BY `created_at`, `id` LIMIT 1) FROM `service_split`;--> statement-breakpoint
DROP TABLE `service_split`;--> statement-breakpoint
ALTER TABLE `__new_service_split` RENAME TO `service_split`;--> statement-breakpoint
CREATE UNIQUE INDEX `service_split_unique` ON `service_split` (`service_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `__new_source_document` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`original_filename` text,
	`mime_type` text,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`received_at` text NOT NULL,
	`email_from` text,
	`email_subject` text,
	`email_message_id` text,
	`status` text DEFAULT 'unprocessed' NOT NULL,
	`extraction_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_source_document` (`id`, `kind`, `path`, `original_filename`, `mime_type`, `sha256`, `size_bytes`, `received_at`, `email_from`, `email_subject`, `email_message_id`, `status`, `extraction_json`, `created_at`, `household_id`)
  SELECT `id`, `kind`, `path`, `original_filename`, `mime_type`, `sha256`, `size_bytes`, `received_at`, `email_from`, `email_subject`, `email_message_id`, `status`, `extraction_json`, `created_at`, (SELECT `id` FROM `household` ORDER BY `created_at`, `id` LIMIT 1) FROM `source_document`;--> statement-breakpoint
DROP TABLE `source_document`;--> statement-breakpoint
ALTER TABLE `__new_source_document` RENAME TO `source_document`;--> statement-breakpoint
CREATE UNIQUE INDEX `source_document_household_sha_unique` ON `source_document` (`household_id`,`sha256`);--> statement-breakpoint
CREATE INDEX `source_document_status_idx` ON `source_document` (`status`);--> statement-breakpoint
CREATE TABLE `__new_bill` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`service_id` text NOT NULL,
	`source_document_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`tax_minor` integer,
	`tax_label` text,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`issue_date` text,
	`due_date` text NOT NULL,
	`usage_quantity` real,
	`usage_unit` text,
	`source` text NOT NULL,
	`extractor` text,
	`confidence` real,
	`external_ref` text,
	`paid_to_provider_at` text,
	`is_anomaly` integer DEFAULT false NOT NULL,
	`anomaly_note` text,
	`notes` text,
	`created_by_member_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_document`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_bill` (`id`, `service_id`, `source_document_id`, `amount_minor`, `currency`, `tax_minor`, `tax_label`, `period_start`, `period_end`, `issue_date`, `due_date`, `usage_quantity`, `usage_unit`, `source`, `extractor`, `confidence`, `external_ref`, `paid_to_provider_at`, `is_anomaly`, `anomaly_note`, `notes`, `created_by_member_id`, `created_at`, `updated_at`, `household_id`)
  SELECT `id`, `service_id`, `source_document_id`, `amount_minor`, `currency`, `tax_minor`, `tax_label`, `period_start`, `period_end`, `issue_date`, `due_date`, `usage_quantity`, `usage_unit`, `source`, `extractor`, `confidence`, `external_ref`, `paid_to_provider_at`, `is_anomaly`, `anomaly_note`, `notes`, `created_by_member_id`, `created_at`, `updated_at`, (SELECT `id` FROM `household` ORDER BY `created_at`, `id` LIMIT 1) FROM `bill`;--> statement-breakpoint
DROP TABLE `bill`;--> statement-breakpoint
ALTER TABLE `__new_bill` RENAME TO `bill`;--> statement-breakpoint
CREATE UNIQUE INDEX `bill_service_external_ref_unique` ON `bill` (`service_id`,`external_ref`);--> statement-breakpoint
CREATE INDEX `bill_household_idx` ON `bill` (`household_id`);--> statement-breakpoint
CREATE INDEX `bill_period_idx` ON `bill` (`period_start`);--> statement-breakpoint
CREATE INDEX `bill_due_idx` ON `bill` (`due_date`);--> statement-breakpoint
CREATE TABLE `__new_share` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`member_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`basis_weight` real NOT NULL,
	`basis_days` integer NOT NULL,
	`period_days` integer NOT NULL,
	`paid_at` text,
	`paid_method` text,
	`payment_reference` text,
	`marked_by_member_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bill_id`) REFERENCES `bill`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
INSERT INTO `__new_share` (`id`, `bill_id`, `member_id`, `amount_minor`, `currency`, `basis_weight`, `basis_days`, `period_days`, `paid_at`, `paid_method`, `payment_reference`, `marked_by_member_id`, `created_at`, `updated_at`, `household_id`)
  SELECT `id`, `bill_id`, `member_id`, `amount_minor`, `currency`, `basis_weight`, `basis_days`, `period_days`, `paid_at`, `paid_method`, `payment_reference`, `marked_by_member_id`, `created_at`, `updated_at`, (SELECT `id` FROM `household` ORDER BY `created_at`, `id` LIMIT 1) FROM `share`;--> statement-breakpoint
DROP TABLE `share`;--> statement-breakpoint
ALTER TABLE `__new_share` RENAME TO `share`;--> statement-breakpoint
CREATE UNIQUE INDEX `share_bill_member_unique` ON `share` (`bill_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `share_member_idx` ON `share` (`member_id`);--> statement-breakpoint
CREATE INDEX `share_household_idx` ON `share` (`household_id`);--> statement-breakpoint
CREATE TABLE `__new_projection` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`service_id` text NOT NULL,
	`period_month` text NOT NULL,
	`estimated_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method` text NOT NULL,
	`inputs_json` text,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_projection` (`id`, `service_id`, `period_month`, `estimated_minor`, `currency`, `method`, `inputs_json`, `computed_at`, `household_id`)
  SELECT `id`, `service_id`, `period_month`, `estimated_minor`, `currency`, `method`, `inputs_json`, `computed_at`, (SELECT `id` FROM `household` ORDER BY `created_at`, `id` LIMIT 1) FROM `projection`;--> statement-breakpoint
DROP TABLE `projection`;--> statement-breakpoint
ALTER TABLE `__new_projection` RENAME TO `projection`;--> statement-breakpoint
CREATE UNIQUE INDEX `projection_service_month_unique` ON `projection` (`service_id`,`period_month`);
