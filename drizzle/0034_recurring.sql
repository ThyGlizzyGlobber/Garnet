ALTER TABLE `bill` ADD `assumed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `service` ADD `recurring_since` text;--> statement-breakpoint
-- Subscriptions and donations still going are recurring from now on (owner):
-- nothing before today is assumed.
UPDATE `service` SET `recurring_since` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `type_slug` IN ('subscriptions', 'donations')
  AND `is_active` = 1 AND `cancelled_at` IS NULL AND `cadence` <> 'irregular';
