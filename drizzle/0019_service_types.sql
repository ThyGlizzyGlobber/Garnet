-- More built-in service types, so the AI can file bills beyond the utilities.
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`) VALUES
  ('phone', 'Phone', NULL, 'phone', 15, 1),
  ('council_rates', 'Council rates', NULL, 'landmark', 60, 1),
  ('strata', 'Strata / body corporate', NULL, 'building', 65, 1),
  ('insurance', 'Insurance', NULL, 'shield', 70, 1),
  ('vehicle_registration', 'Vehicle registration', NULL, 'car', 75, 1),
  ('subscriptions', 'Subscriptions', NULL, 'play', 80, 1);
--> statement-breakpoint
-- Services filed as "Other" before these existed, when their name says what they are.
UPDATE `service` SET `type_slug` = 'council_rates'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%council%' OR lower(`provider`) LIKE '%council%'
    OR lower(`name`) LIKE '%rates%' OR lower(`provider`) LIKE '%shire%'
    OR lower(`provider`) LIKE 'city of %');
--> statement-breakpoint
UPDATE `service` SET `type_slug` = 'insurance'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%insurance%' OR lower(`provider`) LIKE '%insurance%');
