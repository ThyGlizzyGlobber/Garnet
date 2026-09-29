ALTER TABLE `bill` ADD `owner_member_id` text REFERENCES member(id);--> statement-breakpoint
ALTER TABLE `service` ADD `owner_member_id` text REFERENCES member(id);--> statement-breakpoint
CREATE INDEX `service_owner_idx` ON `service` (`owner_member_id`);--> statement-breakpoint
ALTER TABLE `service_type` ADD `personal_by_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `source_document` ADD `member_id` text REFERENCES member(id);--> statement-breakpoint
CREATE INDEX `bill_owner_idx` ON `bill` (`owner_member_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `service_type` (`slug`, `label`, `default_unit`, `icon`, `sort_order`, `is_builtin`) VALUES
  ('car_insurance', 'Car insurance', NULL, 'car-shield', 76, 1);--> statement-breakpoint
-- Usually one person's own: a new one set up from a member's bill is personal to them.
UPDATE `service_type` SET `personal_by_default` = 1 WHERE `slug` IN ('vehicle_registration', 'car_insurance');
