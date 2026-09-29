-- Splits by percentage or set amounts (owner: rent 40/30/30 for a bigger room,
-- water still even). 'fixed' keeps each member's amount per bill here.
ALTER TABLE `service_split` ADD `amount_minor` integer;--> statement-breakpoint
-- The old "custom weights" become percentages of the same proportions (each
-- service's total taken once, before any row changes).
UPDATE `service_split` SET `weight` = ROUND(`service_split`.`weight` * 100.0 / `t`.`total`, 2)
FROM (SELECT `service_id`, SUM(`weight`) AS `total` FROM `service_split` GROUP BY `service_id`) AS `t`
WHERE `t`.`service_id` = `service_split`.`service_id` AND `t`.`total` > 0
  AND `service_split`.`service_id` IN (SELECT `id` FROM `service` WHERE `split_mode` = 'custom');--> statement-breakpoint
UPDATE `service` SET `split_mode` = 'percent' WHERE `split_mode` = 'custom';
