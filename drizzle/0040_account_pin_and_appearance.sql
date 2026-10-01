ALTER TABLE `account` ADD `pin_hash` text;--> statement-breakpoint
ALTER TABLE `account` ADD `theme` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `account` ADD `glass` text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE `account` ADD `last_member_id` text;--> statement-breakpoint
ALTER TABLE `member` ADD `is_primary` integer DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE `account` SET
  `pin_hash` = (SELECT m.`pin_hash` FROM `member` m WHERE m.`account_id` = `account`.`id` AND m.`pin_hash` IS NOT NULL ORDER BY m.`created_at` LIMIT 1),
  `theme` = COALESCE((SELECT m.`theme` FROM `member` m WHERE m.`account_id` = `account`.`id` ORDER BY m.`created_at` LIMIT 1), 'auto'),
  `glass` = COALESCE((SELECT m.`glass` FROM `member` m WHERE m.`account_id` = `account`.`id` ORDER BY m.`created_at` LIMIT 1), 'auto'),
  `last_member_id` = (SELECT m.`id` FROM `member` m WHERE m.`account_id` = `account`.`id` ORDER BY m.`created_at` LIMIT 1);--> statement-breakpoint
UPDATE `member` SET `is_primary` = true WHERE `account_id` IS NOT NULL AND `id` = (SELECT m.`id` FROM `member` m WHERE m.`account_id` = `member`.`account_id` ORDER BY m.`created_at` LIMIT 1);--> statement-breakpoint
ALTER TABLE `member` DROP COLUMN `appearance_preset`;--> statement-breakpoint
ALTER TABLE `member` DROP COLUMN `theme`;--> statement-breakpoint
ALTER TABLE `member` DROP COLUMN `glass`;
