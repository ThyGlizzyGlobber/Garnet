-- Every top-level entry on the Services page wears a colour of its own
-- (owner, 2026-10-01): the everyday bills keep theirs, each main service has
-- one (Vehicles slate, Health red, Lifestyle lime, Home & property brown,
-- Subscriptions plum, Other grey), and the parts inside a main service wear
-- shades of it (src/lib/palette.ts: "-1" darkest … "-8" lightest).
UPDATE `service_type` SET `colour` = CASE `slug`
  -- Vehicles: slate.
  WHEN 'vehicle_registration' THEN '#5b6f8a'
  WHEN 'car_insurance' THEN '#3b485a'
  WHEN 'roadside_assistance' THEN '#919fb1'
  WHEN 'vehicle_maintenance' THEN '#bdc5d0'
  -- Health: red.
  WHEN 'health_insurance' THEN '#e34948'
  WHEN 'ambulance_cover' THEN '#ec8584'
  -- Lifestyle: lime.
  WHEN 'gym' THEN '#7a9f12'
  WHEN 'donations' THEN '#a6bf60'
  -- Home & property: brown.
  WHEN 'strata' THEN '#644526'
  WHEN 'building_insurance' THEN '#7b552e'
  WHEN 'contents_insurance' THEN '#8e6235'
  WHEN 'gardening' THEN '#9a6a3a'
  WHEN 'cleaning' THEN '#ac855d'
  WHEN 'pest_control' THEN '#bb9b7b'
  WHEN 'pool' THEN '#c9b097'
  WHEN 'repairs' THEN '#d7c3b0'
  -- Its own main service, and the rest.
  WHEN 'subscriptions' THEN '#9c3d8f'
  WHEN 'other' THEN '#7c828c'
  ELSE `colour` END;
--> statement-breakpoint
-- Every service wears its type's colour.
UPDATE `service` SET `colour` = (SELECT `colour` FROM `service_type` WHERE `slug` = `service`.`type_slug`);
