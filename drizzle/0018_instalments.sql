CREATE TABLE `bill_instalment` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`bill_id` text NOT NULL,
	`seq` integer NOT NULL,
	`due_date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`paid_to_provider_at` text,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bill_id`) REFERENCES `bill`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bill_instalment_bill_seq_unique` ON `bill_instalment` (`bill_id`,`seq`);--> statement-breakpoint
CREATE INDEX `bill_instalment_household_idx` ON `bill_instalment` (`household_id`);--> statement-breakpoint
DROP INDEX `share_bill_member_unique`;--> statement-breakpoint
ALTER TABLE `share` ADD `instalment` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `share` ADD `due_date` text;--> statement-breakpoint
CREATE UNIQUE INDEX `share_bill_member_unique` ON `share` (`bill_id`,`member_id`,`instalment`);--> statement-breakpoint
ALTER TABLE `bill` ADD `full_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `bill` ADD `full_due_date` text;--> statement-breakpoint
ALTER TABLE `bill` ADD `payment_plan` text;