CREATE TABLE `weather_day` (
	`cell` text NOT NULL,
	`date` text NOT NULL,
	`temp_mean` real,
	`temp_min` real,
	`temp_max` real,
	`radiation` real,
	`sunshine` real,
	`code` integer,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`cell`, `date`)
);
--> statement-breakpoint
CREATE TABLE `weather_forecast` (
	`cell` text NOT NULL,
	`date` text NOT NULL,
	`temp_mean` real,
	`temp_min` real,
	`temp_max` real,
	`radiation` real,
	`sunshine` real,
	`code` integer,
	`rain_chance` integer,
	`fetched_at` text NOT NULL,
	PRIMARY KEY(`cell`, `date`)
);
--> statement-breakpoint
ALTER TABLE `bill` ADD `hdd` real;--> statement-breakpoint
ALTER TABLE `bill` ADD `cdd` real;--> statement-breakpoint
ALTER TABLE `bill` ADD `solar_mj` real;--> statement-breakpoint
ALTER TABLE `bill` ADD `weather_filled_at` text;