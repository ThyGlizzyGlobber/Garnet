-- Roadside assistance (owner): usually one person's own, like their car's rego
-- and insurance, so a new one from a member's bill is personal to them.
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`, `personal_by_default`) VALUES
  ('roadside_assistance', 'Roadside assistance', NULL, 'roadside', 77, 1, 1);
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'roadside_assistance'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%roadside%' OR lower(`provider`) LIKE '%roadside%');
--> statement-breakpoint
UPDATE `service`
SET `name` = (SELECT `label` FROM `service_type` WHERE `slug` = `service`.`type_slug`)
WHERE lower(trim(`name`)) = 'other' AND `type_slug` <> 'other';
