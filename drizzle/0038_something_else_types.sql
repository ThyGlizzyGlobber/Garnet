-- "Something else" inside each main service (owner, 2026-10-01: adding a
-- physio under Health only offered Health insurance and Ambulance cover).
-- Each wears a shade of its main service's colour not yet taken; Home &
-- property's eight are all worn, so it gets a ninth, a greyed brown.
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`, `personal_by_default`, `category`, `colour`) VALUES
  ('health_other', 'Other health costs', NULL, 'more', 74, 1, 0, 'health', '#b63a3a'),
  ('vehicle_other', 'Other vehicle costs', NULL, 'more', 79, 1, 1, 'vehicle', '#a8b3c1'),
  ('lifestyle_other', 'Other lifestyle costs', NULL, 'more', 83, 1, 0, 'lifestyle', '#627f0e'),
  ('home_other', 'Other home costs', NULL, 'more', 90, 1, 0, 'home', '#8f8276');
