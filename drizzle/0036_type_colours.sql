-- Each type wears the colour of what it is (owner, 2026-10-01): water is blue,
-- electricity yellow, gas orange, gardening green… The everyday bills
-- (internet, electricity, gas, water, phone, rent, council rates) stay all
-- different; rarer types share. Fixed for every household.
UPDATE `service_type` SET `colour` = CASE `slug`
  WHEN 'water' THEN '#2a78d6'
  WHEN 'pool' THEN '#2a78d6'
  WHEN 'vehicle_registration' THEN '#2a78d6'
  WHEN 'electricity' THEN '#eda100'
  WHEN 'repairs' THEN '#eda100'
  WHEN 'roadside_assistance' THEN '#eda100'
  WHEN 'gas' THEN '#eb6834'
  WHEN 'pest_control' THEN '#eb6834'
  WHEN 'vehicle_maintenance' THEN '#eb6834'
  WHEN 'gym' THEN '#eb6834'
  WHEN 'council_rates' THEN '#008300'
  WHEN 'gardening' THEN '#008300'
  WHEN 'phone' THEN '#1baf7a'
  WHEN 'cleaning' THEN '#1baf7a'
  WHEN 'internet' THEN '#4a3aa7'
  WHEN 'strata' THEN '#4a3aa7'
  WHEN 'building_insurance' THEN '#4a3aa7'
  WHEN 'car_insurance' THEN '#4a3aa7'
  WHEN 'rent' THEN '#e87ba4'
  WHEN 'contents_insurance' THEN '#e87ba4'
  WHEN 'health_insurance' THEN '#e87ba4'
  WHEN 'subscriptions' THEN '#e87ba4'
  WHEN 'other' THEN '#e87ba4'
  WHEN 'ambulance_cover' THEN '#e34948'
  WHEN 'donations' THEN '#e34948'
  ELSE `colour` END;
--> statement-breakpoint
-- Every service wears its type's colour.
UPDATE `service` SET `colour` = (SELECT `colour` FROM `service_type` WHERE `slug` = `service`.`type_slug`);
