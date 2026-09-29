ALTER TABLE `service_type` ADD `category` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
-- Gym memberships and vehicle repairs & servicing (owner), usually one person's own.
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`, `personal_by_default`) VALUES
  ('vehicle_maintenance', 'Vehicle repairs & servicing', NULL, 'car-wrench', 78, 1, 1),
  ('gym', 'Gym membership', NULL, 'dumbbell', 81, 1, 1);
--> statement-breakpoint
-- Groups for the type picker.
UPDATE `service_type` SET `category` = 'utilities' WHERE `slug` IN ('internet', 'phone', 'electricity', 'gas', 'water');
--> statement-breakpoint
UPDATE `service_type` SET `category` = 'home' WHERE `slug` IN ('rent', 'council_rates', 'strata', 'contents_insurance', 'building_insurance', 'gardening', 'cleaning', 'pest_control', 'pool', 'repairs');
--> statement-breakpoint
UPDATE `service_type` SET `category` = 'health' WHERE `slug` IN ('health_insurance', 'ambulance_cover');
--> statement-breakpoint
UPDATE `service_type` SET `category` = 'vehicle' WHERE `slug` IN ('vehicle_registration', 'car_insurance', 'roadside_assistance', 'vehicle_maintenance');
--> statement-breakpoint
UPDATE `service_type` SET `category` = 'lifestyle' WHERE `slug` IN ('gym', 'subscriptions');
--> statement-breakpoint
-- Services filed as "Other" before these existed, when their name says what they are.
UPDATE `service` SET `type_slug` = 'gym'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%gym%' OR lower(`name`) LIKE '%fitness%'
    OR lower(`provider`) LIKE '%gym%' OR lower(`provider`) LIKE '%fitness%');
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'vehicle_maintenance'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%mechanic%' OR lower(`name`) LIKE '%car service%' OR lower(`name`) LIKE '%tyre%'
    OR lower(`provider`) LIKE '%mechanic%' OR lower(`provider`) LIKE '%tyre%');
--> statement-breakpoint
UPDATE `service`
SET `name` = (SELECT `label` FROM `service_type` WHERE `slug` = `service`.`type_slug`)
WHERE lower(trim(`name`)) = 'other' AND `type_slug` <> 'other';
