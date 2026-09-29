ALTER TABLE `service` ADD `set_up_by_member_id` text REFERENCES member(id);--> statement-breakpoint
ALTER TABLE `service` ADD `owner_asked_at` text;--> statement-breakpoint
ALTER TABLE `service` ADD `owner_confirmed_at` text;--> statement-breakpoint
-- Services already set up automatically in a household that splits bills: ask
-- once whether they're someone's own. That's car rego, car insurance and the
-- like, and anything set up since personal services arrived (2026-09-29), in
-- case the reader filed someone's own bill under another type.
UPDATE `service` SET `owner_asked_at` = `created_at`
WHERE `notes` LIKE 'Set up automatically%'
  AND (`type_slug` IN (SELECT `slug` FROM `service_type` WHERE `personal_by_default` = 1)
    OR `created_at` >= '2026-09-29')
  AND `household_id` IN (SELECT `id` FROM `household` WHERE `split_mode` = 'shared');
