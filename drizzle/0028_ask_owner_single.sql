-- Whose a bill is matters whenever more than one person lives in a household,
-- whether or not it splits its bills (owner: their household doesn't split, and
-- their mum's car rego showed nowhere as hers). 0027 only asked in households
-- that split bills; ask the same way in the others that have housemates.
UPDATE `service` SET `owner_asked_at` = `created_at`
WHERE `owner_asked_at` IS NULL
  AND `owner_confirmed_at` IS NULL
  AND `notes` LIKE 'Set up automatically%'
  AND (`type_slug` IN (SELECT `slug` FROM `service_type` WHERE `personal_by_default` = 1)
    OR `created_at` >= '2026-09-29')
  AND `household_id` IN (
    SELECT `household_id` FROM `member` GROUP BY `household_id` HAVING count(*) > 1
  );
