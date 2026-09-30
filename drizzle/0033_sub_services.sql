ALTER TABLE `service` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `service` ADD `cancelled_by_member_id` text REFERENCES member(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `service_type` ADD `colour` text DEFAULT '#e87ba4' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_type` ADD `has_sub_services` integer DEFAULT false NOT NULL;--> statement-breakpoint
-- Donations (owner): a main service whose sub-services are the charities
-- (Peter Mac, Red Cross). Usually one person's own, like their tax receipts.
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`, `personal_by_default`, `category`) VALUES
  ('donations', 'Donations', NULL, 'hand-heart', 82, 1, 1, 'lifestyle');
--> statement-breakpoint
-- Main services that hold sub-services, one per provider.
UPDATE `service_type` SET `has_sub_services` = 1 WHERE `slug` IN ('subscriptions', 'donations');
--> statement-breakpoint
-- One colour per type, the same in every household (owner). The common
-- utilities and home costs get colours of their own; rarer types share.
UPDATE `service_type` SET `colour` = CASE `slug`
  WHEN 'internet' THEN '#2a78d6'
  WHEN 'electricity' THEN '#eda100'
  WHEN 'gas' THEN '#eb6834'
  WHEN 'water' THEN '#1baf7a'
  WHEN 'phone' THEN '#e34948'
  WHEN 'rent' THEN '#4a3aa7'
  WHEN 'council_rates' THEN '#008300'
  WHEN 'strata' THEN '#e87ba4'
  WHEN 'contents_insurance' THEN '#2a78d6'
  WHEN 'building_insurance' THEN '#4a3aa7'
  WHEN 'gardening' THEN '#008300'
  WHEN 'cleaning' THEN '#1baf7a'
  WHEN 'pest_control' THEN '#eb6834'
  WHEN 'pool' THEN '#2a78d6'
  WHEN 'repairs' THEN '#eda100'
  WHEN 'health_insurance' THEN '#e34948'
  WHEN 'ambulance_cover' THEN '#eb6834'
  WHEN 'vehicle_registration' THEN '#e87ba4'
  WHEN 'car_insurance' THEN '#4a3aa7'
  WHEN 'roadside_assistance' THEN '#eda100'
  WHEN 'vehicle_maintenance' THEN '#2a78d6'
  WHEN 'gym' THEN '#008300'
  WHEN 'subscriptions' THEN '#e87ba4'
  WHEN 'donations' THEN '#e34948'
  WHEN 'other' THEN '#e87ba4'
  ELSE `colour` END;
--> statement-breakpoint
-- Every service wears its type's colour.
UPDATE `service` SET `colour` = (SELECT `colour` FROM `service_type` WHERE `slug` = `service`.`type_slug`);
--> statement-breakpoint
-- Services filed as "Other" that are plainly donations.
UPDATE `service` SET `type_slug` = 'donations', `colour` = '#e34948'
WHERE `type_slug` = 'other'
  AND (lower(`name`) LIKE '%donation%' OR lower(`name`) LIKE '%charity%');
--> statement-breakpoint
-- A sub-service is named after its provider (Netflix, not "Subscriptions (Netflix)").
UPDATE `service` SET `name` = `provider`
WHERE `type_slug` IN ('subscriptions', 'donations')
  AND trim(`provider`) <> ''
  AND (lower(trim(`name`)) = lower((SELECT `label` FROM `service_type` WHERE `slug` = `service`.`type_slug`))
    OR lower(`name`) LIKE lower((SELECT `label` FROM `service_type` WHERE `slug` = `service`.`type_slug`)) || ' (%)'
    OR lower(trim(`name`)) = 'other');
