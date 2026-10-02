ALTER TABLE `member` ADD `nav_layout` text;--> statement-breakpoint
-- Main services and their parts in Title Case (owner, 2026-10-02: "Home &
-- Property", "Repairs & Maintenance"). Services named after their type follow.
CREATE TEMP TABLE `_label_case` (`slug` text, `old` text, `new` text);
--> statement-breakpoint
INSERT INTO `_label_case` VALUES
  ('ambulance_cover', 'Ambulance cover', 'Ambulance Cover'),
  ('building_insurance', 'Building insurance', 'Building Insurance'),
  ('car_insurance', 'Car insurance', 'Car Insurance'),
  ('contents_insurance', 'Contents insurance', 'Contents Insurance'),
  ('council_rates', 'Council rates', 'Council Rates'),
  ('gym', 'Gym membership', 'Gym Membership'),
  ('health_insurance', 'Health insurance', 'Health Insurance'),
  ('health_other', 'Other health costs', 'Other Health Costs'),
  ('home_other', 'Other home costs', 'Other Home Costs'),
  ('lifestyle_other', 'Other lifestyle costs', 'Other Lifestyle Costs'),
  ('vehicle_other', 'Other vehicle costs', 'Other Vehicle Costs'),
  ('pest_control', 'Pest control', 'Pest Control'),
  ('pool', 'Pool & spa', 'Pool & Spa'),
  ('repairs', 'Repairs & maintenance', 'Repairs & Maintenance'),
  ('roadside_assistance', 'Roadside assistance', 'Roadside Assistance'),
  ('strata', 'Strata / body corporate', 'Strata / Body Corporate'),
  ('vehicle_maintenance', 'Vehicle repairs & servicing', 'Vehicle Repairs & Servicing'),
  ('vehicle_registration', 'Vehicle registration', 'Vehicle Registration');
--> statement-breakpoint
UPDATE `service_type` SET `label` = (SELECT `new` FROM `_label_case` WHERE `_label_case`.`slug` = `service_type`.`slug`)
  WHERE `slug` IN (SELECT `slug` FROM `_label_case`);
--> statement-breakpoint
UPDATE `service` SET `name` = (SELECT `new` FROM `_label_case` WHERE `_label_case`.`old` = `service`.`name`)
  WHERE `name` IN (SELECT `old` FROM `_label_case`);
--> statement-breakpoint
DROP TABLE `_label_case`;
--> statement-breakpoint
-- Land tax under Home & Property, beside council rates, which moves in there
-- too (owner, 2026-10-02); both wear shades of its brown (brown-10, brown-11).
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`, `personal_by_default`, `category`, `colour`) VALUES
  ('land_tax', 'Land Tax', NULL, 'receipt', 62, 1, 0, 'home', '#a99a8c');
--> statement-breakpoint
UPDATE `service_type` SET `colour` = '#4d3520' WHERE `slug` = 'council_rates';
--> statement-breakpoint
-- Donations is a main service of its own, like Subscriptions: green, which
-- council rates no longer wears at the top level.
UPDATE `service_type` SET `colour` = '#008300' WHERE `slug` = 'donations';
--> statement-breakpoint
UPDATE `service` SET `colour` = (SELECT `colour` FROM `service_type` WHERE `slug` = `service`.`type_slug`)
  WHERE `type_slug` IN ('council_rates', 'land_tax', 'donations');
