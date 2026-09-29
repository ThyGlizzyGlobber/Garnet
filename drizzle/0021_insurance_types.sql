-- Insurance is three services, not one (owner): health, contents, and the
-- home/building itself. The all-in-one "insurance" type is retired.
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`) VALUES
  ('health_insurance', 'Health insurance', NULL, 'heart', 70, 1),
  ('contents_insurance', 'Contents insurance', NULL, 'sofa', 71, 1),
  ('building_insurance', 'Building insurance', NULL, 'house-shield', 72, 1);
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'health_insurance'
WHERE `type_slug` = 'insurance'
  AND (lower(`name`) LIKE '%health%' OR lower(`provider`) LIKE '%health%'
    OR lower(`name`) LIKE '%hospital%' OR lower(`name`) LIKE '%extras%');
--> statement-breakpoint
-- A combined home & contents policy covers the building: building insurance.
UPDATE `service` SET `type_slug` = 'building_insurance'
WHERE `type_slug` = 'insurance'
  AND (lower(`name`) LIKE '%home%' OR lower(`name`) LIKE '%building%'
    OR lower(`name`) LIKE '%property%' OR lower(`name`) LIKE '%landlord%'
    OR lower(`provider`) LIKE '%home%' OR lower(`provider`) LIKE '%building%');
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'contents_insurance'
WHERE `type_slug` = 'insurance'
  AND (lower(`name`) LIKE '%contents%' OR lower(`name`) LIKE '%renter%');
--> statement-breakpoint
-- Anything else is unfiled until its next bill says which it is.
UPDATE `service` SET `type_slug` = 'other' WHERE `type_slug` = 'insurance';
--> statement-breakpoint
DELETE FROM `service_type` WHERE `slug` = 'insurance';
