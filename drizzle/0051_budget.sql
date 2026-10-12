CREATE TABLE `household_budget` (
	`household_id` text NOT NULL,
	`year` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`household_id`, `year`),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `service` ADD `expected_amount_minor` integer;--> statement-breakpoint
ALTER TABLE `service` ADD `expected_on` text;