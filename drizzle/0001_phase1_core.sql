CREATE TABLE `bill` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_document_id`) REFERENCES `source_document`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_service_external_ref_unique` ON `bill` (`service_id`,`external_ref`);--> statement-breakpoint
CREATE INDEX `bill_period_idx` ON `bill` (`period_start`);--> statement-breakpoint
CREATE INDEX `bill_due_idx` ON `bill` (`due_date`);--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`pin_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`split_weight` real DEFAULT 1 NOT NULL,
	`active_from` text NOT NULL,
	`active_to` text,
	`colour` text DEFAULT '#0a84ff' NOT NULL,
	`payment_details` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_name_unique` ON `member` (`name`);--> statement-breakpoint
CREATE TABLE `projection` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text NOT NULL,
	`period_month` text NOT NULL,
	`estimated_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method` text NOT NULL,
	`inputs_json` text,
	`computed_at` text NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projection_service_month_unique` ON `projection` (`service_id`,`period_month`);--> statement-breakpoint
CREATE TABLE `service` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`type_slug`) REFERENCES `service_type`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payer_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `service_type_idx` ON `service` (`type_slug`);--> statement-breakpoint
CREATE TABLE `service_split` (
	`service_id` text NOT NULL,
	`member_id` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `service`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `service_split_unique` ON `service_split` (`service_id`,`member_id`);--> statement-breakpoint
CREATE TABLE `service_type` (
	`slug` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`default_unit` text,
	`icon` text DEFAULT 'receipt' NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `share` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`bill_id`) REFERENCES `bill`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marked_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_bill_member_unique` ON `share` (`bill_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `share_member_idx` ON `share` (`member_id`);--> statement-breakpoint
CREATE TABLE `source_document` (
	`id` text PRIMARY KEY NOT NULL,
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
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_document_sha_unique` ON `source_document` (`sha256`);--> statement-breakpoint
CREATE INDEX `source_document_status_idx` ON `source_document` (`status`);--> statement-breakpoint
ALTER TABLE `household` ADD `split_mode` text DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE `household` ADD `payment_reference_template` text DEFAULT '{service} {period} {member}' NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`) VALUES
  ('internet', 'Internet', NULL, 'wifi', 10, 1),
  ('electricity', 'Electricity', 'kWh', 'bolt', 20, 1),
  ('gas', 'Gas', 'MJ', 'flame', 30, 1),
  ('water', 'Water', 'kL', 'drop', 40, 1),
  ('rent', 'Rent', NULL, 'home', 50, 1),
  ('other', 'Other', NULL, 'receipt', 900, 1);
