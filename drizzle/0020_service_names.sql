-- Services set up automatically are named after their type. Those set up as
-- "Other" and re-filed by 0019 (e.g. as Council rates) still carried the name
-- "Other": give them their type's name.
UPDATE `service`
SET `name` = (SELECT `label` FROM `service_type` WHERE `slug` = `service`.`type_slug`)
WHERE lower(trim(`name`)) = 'other' AND `type_slug` <> 'other';
