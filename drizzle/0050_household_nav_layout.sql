ALTER TABLE `household` ADD `nav_layout` text;--> statement-breakpoint
-- Each household starts from its first admin's arrangement (SCOPE-shell.md §8 Q1):
-- the earliest admin who had arranged the menu. Only its household part is read.
UPDATE `household` SET `nav_layout` = (
  SELECT `m`.`nav_layout` FROM `member` `m`
  WHERE `m`.`household_id` = `household`.`id` AND `m`.`role` = 'owner' AND `m`.`nav_layout` IS NOT NULL
  ORDER BY `m`.`created_at` LIMIT 1
);
