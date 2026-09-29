-- Home services (owner's mum: gardener, cleaner and the like) and ambulance cover.
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`) VALUES
  ('ambulance_cover', 'Ambulance cover', NULL, 'cross', 73, 1),
  ('gardening', 'Gardening', NULL, 'leaf', 85, 1),
  ('cleaning', 'Cleaning', NULL, 'spray', 86, 1),
  ('pest_control', 'Pest control', NULL, 'bug', 87, 1),
  ('pool', 'Pool & spa', NULL, 'waves', 88, 1),
  ('repairs', 'Repairs & maintenance', NULL, 'wrench', 89, 1);
--> statement-breakpoint
-- Services filed as "Other" before these existed, when their name says what they are.
UPDATE `service` SET `type_slug` = 'ambulance_cover'
WHERE `type_slug` = 'other' AND (lower(`name`) LIKE '%ambulance%' OR lower(`provider`) LIKE '%ambulance%');
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'gardening'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%garden%' OR lower(`name`) LIKE '%lawn%' OR lower(`name`) LIKE '%mowing%'
    OR lower(`provider`) LIKE '%garden%' OR lower(`provider`) LIKE '%lawn%' OR lower(`provider`) LIKE '%mowing%');
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'cleaning'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%cleaner%' OR lower(`name`) LIKE '%cleaning%'
    OR lower(`provider`) LIKE '%cleaner%' OR lower(`provider`) LIKE '%cleaning%');
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'pest_control'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%pest%' OR lower(`name`) LIKE '%termite%'
    OR lower(`provider`) LIKE '%pest%' OR lower(`provider`) LIKE '%termite%');
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'pool'
WHERE `type_slug` = 'other' AND (lower(`name`) LIKE '%pool%' OR lower(`provider`) LIKE '%pool%');
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'repairs'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%handyman%' OR lower(`name`) LIKE '%plumb%' OR lower(`name`) LIKE '%electrician%'
    OR lower(`name`) LIKE '%repair%' OR lower(`name`) LIKE '%maintenance%'
    OR lower(`provider`) LIKE '%handyman%' OR lower(`provider`) LIKE '%plumb%' OR lower(`provider`) LIKE '%electrician%');
--> statement-breakpoint
-- Services named after their old type ("Other") take the new type's name.
UPDATE `service`
SET `name` = (SELECT `label` FROM `service_type` WHERE `slug` = `service`.`type_slug`)
WHERE lower(trim(`name`)) = 'other' AND `type_slug` <> 'other';
