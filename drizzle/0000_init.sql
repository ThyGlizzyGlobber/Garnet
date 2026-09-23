CREATE TABLE `household` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`locale` text NOT NULL,
	`timezone` text NOT NULL,
	`fiscal_year_start_month` integer DEFAULT 1 NOT NULL,
	`week_starts_on` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
